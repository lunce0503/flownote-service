"""The single source of truth for how a FlowNote agent conversation becomes text.

Gemma 4 has native single tokens for the entire agent loop, so this module does
NOT invent a format - it renders through the model's own chat template and
parses the model's own output syntax. Verified against
``google/gemma-4-E2B-it``: every control token below is exactly one token id.

    <|turn> 105   <turn|> 106            turn delimiters
    <|tool> 46    <tool|> 47             tool declaration
    <|tool_call> 48  <tool_call|> 49     model asks for a tool
    <|tool_response> 50  <tool_response|> 51   environment answers
    <|"|> 52                             string delimiter
    <|think|> 98                         enables thinking mode
    <|channel> 100  <channel|> 101       reasoning channel

Three consequences that shape everything downstream:

1. **The whole agent loop is ONE model turn.** thought -> call -> response ->
   thought -> answer all live inside a single ``<|turn>model ... <turn|>``.
   There is no turn alternation to mark tool results, which is why the loss mask
   is a token-level state machine (see build_loss_mask) rather than a span list.

2. **Rendering goes through ``tokenizer.apply_chat_template``.** Google ships a
   400-line Jinja template and revised it on 2026-07-09 specifically to fix
   "tool-calling loops, turn closures, and thinking content-ordering".
   Reimplementing that by hand guarantees drift. We only hand-write the parser,
   because there isn't one in the box.

3. **Arguments are not JSON.** Gemma 4 uses ``call:name{key:<|"|>value<|"|>}``
   with a dedicated string-delimiter token. format_argument/parse_value below
   mirror the template's own encoder exactly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal

# --------------------------------------------------------------------------- #
# control tokens
# --------------------------------------------------------------------------- #

TURN_OPEN, TURN_CLOSE = "<|turn>", "<turn|>"
TOOL_OPEN, TOOL_CLOSE = "<|tool>", "<tool|>"
CALL_OPEN, CALL_CLOSE = "<|tool_call>", "<tool_call|>"
RESP_OPEN, RESP_CLOSE = "<|tool_response>", "<tool_response|>"
STR = '<|"|>'
THINK = "<|think|>"
CHANNEL_OPEN, CHANNEL_CLOSE = "<|channel>", "<channel|>"
THOUGHT_HEADER = "thought"

CONTROL_TOKENS = (
    TURN_OPEN, TURN_CLOSE, TOOL_OPEN, TOOL_CLOSE,
    CALL_OPEN, CALL_CLOSE, RESP_OPEN, RESP_CLOSE,
    STR, THINK, CHANNEL_OPEN, CHANNEL_CLOSE,
)

DEFAULT_SYSTEM_KO = (
    "너는 FlowNote의 노트 관리 에이전트다. 선언된 도구만 사용할 수 있다.\n"
    "규칙:\n"
    "1. 필수 인자를 모를 때는 추측하지 말고 사용자에게 되묻는다.\n"
    "2. 상대 시간(\"30분 뒤\")은 get_current_time으로 기준 시각을 먼저 확인한다.\n"
    "3. 도구가 필요 없으면 곧바로 사용자 언어로 답한다.\n"
    "4. 삭제처럼 되돌릴 수 없는 작업은 반드시 사용자 확인을 받는다.\n"
    "5. 도구 결과에 없는 내용을 지어내지 않는다."
)


# --------------------------------------------------------------------------- #
# conversation model
# --------------------------------------------------------------------------- #

@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass
class Message:
    role: Literal["user", "assistant", "tool"]
    content: str | None = None
    thought: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    name: str | None = None          # tool name, for role="tool"
    result: Any = None               # tool payload, for role="tool"


@dataclass
class Sample:
    messages: list[Message]
    tools: list[dict[str, Any]] = field(default_factory=list)
    system: str = DEFAULT_SYSTEM_KO
    lang: str = "ko"
    source: str = "unknown"
    id: str | None = None


# --------------------------------------------------------------------------- #
# value encoding  (mirrors format_argument in the official chat template)
# --------------------------------------------------------------------------- #

def format_argument(value: Any, escape_keys: bool = False) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):                 # before int - bool is an int
        return "true" if value else "false"
    if isinstance(value, str):
        return f"{STR}{value}{STR}"
    if isinstance(value, dict):
        parts = []
        for key in sorted(value):               # template uses | dictsort
            k = f"{STR}{key}{STR}" if escape_keys else str(key)
            parts.append(f"{k}:{format_argument(value[key], escape_keys)}")
        return "{" + ",".join(parts) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(format_argument(v, escape_keys) for v in value) + "]"
    return str(value)


def format_tool_call(call: ToolCall) -> str:
    body = ",".join(
        f"{key}:{format_argument(call.arguments[key])}" for key in sorted(call.arguments)
    )
    return f"{CALL_OPEN}call:{call.name}{{{body}}}{CALL_CLOSE}"


def format_tool_response(name: str, response: Any) -> str:
    """What the environment appends after the model stops at <|tool_response>."""
    if isinstance(response, dict):
        body = ",".join(
            f"{key}:{format_argument(response[key])}" for key in sorted(response)
        )
        return f"response:{name}{{{body}}}{RESP_CLOSE}"
    return f"response:{name}{{value:{format_argument(response)}}}{RESP_CLOSE}"


# --------------------------------------------------------------------------- #
# value parsing
# --------------------------------------------------------------------------- #

class ParseError(ValueError):
    pass


class _Scanner:
    def __init__(self, text: str):
        self.s = text
        self.i = 0

    def skip_ws(self) -> None:
        while self.i < len(self.s) and self.s[self.i] in " \t\n\r":
            self.i += 1

    def at(self, literal: str) -> bool:
        return self.s.startswith(literal, self.i)

    def take(self, literal: str) -> None:
        if not self.at(literal):
            raise ParseError(f"expected {literal!r} at {self.i} in {self.s[:80]!r}")
        self.i += len(literal)

    def value(self) -> Any:
        self.skip_ws()
        if self.at(STR):
            self.i += len(STR)
            end = self.s.find(STR, self.i)
            if end < 0:
                raise ParseError("unterminated string")
            out = self.s[self.i:end]
            self.i = end + len(STR)
            return out
        if self.at("{"):
            return self.mapping()
        if self.at("["):
            return self.array()
        return self.literal()

    def mapping(self) -> dict[str, Any]:
        self.take("{")
        out: dict[str, Any] = {}
        self.skip_ws()
        if self.at("}"):
            self.i += 1
            return out
        while True:
            self.skip_ws()
            if self.at(STR):
                self.i += len(STR)
                end = self.s.find(STR, self.i)
                if end < 0:
                    raise ParseError("unterminated key")
                key, self.i = self.s[self.i:end], end + len(STR)
            else:
                end = self.s.find(":", self.i)
                if end < 0:
                    raise ParseError("key without ':'")
                key, self.i = self.s[self.i:end].strip(), end
            self.take(":")
            out[key] = self.value()
            self.skip_ws()
            if self.at(","):
                self.i += 1
                continue
            self.take("}")
            return out

    def array(self) -> list[Any]:
        self.take("[")
        out: list[Any] = []
        self.skip_ws()
        if self.at("]"):
            self.i += 1
            return out
        while True:
            out.append(self.value())
            self.skip_ws()
            if self.at(","):
                self.i += 1
                continue
            self.take("]")
            return out

    def literal(self) -> Any:
        start = self.i
        while self.i < len(self.s) and self.s[self.i] not in ",}]":
            self.i += 1
        raw = self.s[start:self.i].strip()
        if raw == "true":
            return True
        if raw == "false":
            return False
        if raw in ("null", "None", ""):
            return None
        try:
            return int(raw)
        except ValueError:
            pass
        try:
            return float(raw)
        except ValueError:
            # An unquoted string. The model is supposed to delimit strings with
            # <|"|>; accepting the bare form keeps a recoverable slip out of the
            # hard-error path, and eval still scores it as an argument mismatch.
            return raw


def parse_arguments(text: str) -> dict[str, Any]:
    scanner = _Scanner(text)
    value = scanner.mapping()
    return value


# --------------------------------------------------------------------------- #
# parsing model output
# --------------------------------------------------------------------------- #

@dataclass
class ParsedTurn:
    thought: str | None = None
    thoughts: list[str] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    content: str | None = None
    errors: list[str] = field(default_factory=list)
    stopped_for_tool: bool = False

    @property
    def wants_tool(self) -> bool:
        return bool(self.tool_calls)

    @property
    def ok(self) -> bool:
        return not self.errors


def _blocks(text: str, open_tag: str, close_tag: str) -> tuple[list[str], bool]:
    """Returns (block bodies, saw_unterminated)."""
    out, cursor, truncated = [], 0, False
    while True:
        i = text.find(open_tag, cursor)
        if i < 0:
            return out, truncated
        j = text.find(close_tag, i + len(open_tag))
        if j < 0:
            out.append(text[i + len(open_tag):])
            return out, True
        out.append(text[i + len(open_tag):j])
        cursor = j + len(close_tag)


def _strip_blocks(text: str, pairs: Iterable[tuple[str, str]]) -> str:
    for open_tag, close_tag in pairs:
        while True:
            i = text.find(open_tag)
            if i < 0:
                break
            j = text.find(close_tag, i)
            text = text[:i] + (text[j + len(close_tag):] if j >= 0 else "")
    return text


def _parse(text: str, strict: bool) -> ParsedTurn:
    turn = ParsedTurn()

    if text.startswith(f"{TURN_OPEN}model\n"):
        text = text[len(f"{TURN_OPEN}model\n"):]

    # A generation step ends either at <turn|> (done) or at <|tool_response>
    # (waiting for the environment). Both are stop tokens; anything after them
    # in a decoded string is the harness echoing, not the model deciding.
    cut = len(text)
    for stop in (TURN_CLOSE, "<eos>"):
        i = text.find(stop)
        if i >= 0:
            cut = min(cut, i)
    text = text[:cut]
    if text.rstrip().endswith(RESP_OPEN):
        turn.stopped_for_tool = True

    thoughts, thought_truncated = _blocks(text, CHANNEL_OPEN, CHANNEL_CLOSE)
    for raw in thoughts:
        body = raw
        if body.startswith(THOUGHT_HEADER):
            body = body[len(THOUGHT_HEADER):]
        turn.thoughts.append(body.strip())
    if turn.thoughts:
        turn.thought = turn.thoughts[0]
    if thought_truncated:
        turn.errors.append("unterminated thought channel")
    if strict and len(turn.thoughts) > 1:
        turn.errors.append(f"expected 1 thought, found {len(turn.thoughts)}")

    calls, call_truncated = _blocks(text, CALL_OPEN, CALL_CLOSE)
    if call_truncated:
        turn.errors.append("unterminated tool_call")
    for raw in calls:
        raw = raw.strip()
        if not raw.startswith("call:"):
            turn.errors.append("tool_call missing 'call:' prefix")
            continue
        body = raw[len("call:"):]
        brace = body.find("{")
        if brace < 0:
            turn.errors.append("tool_call missing argument block")
            continue
        name = body[:brace].strip()
        if not name:
            turn.errors.append("tool_call missing function name")
            continue
        try:
            arguments = parse_arguments(body[brace:])
        except ParseError as exc:
            turn.errors.append(f"'{name}': {exc}")
            continue
        turn.tool_calls.append(ToolCall(name=name, arguments=arguments))

    prose = _strip_blocks(text, (
        (CHANNEL_OPEN, CHANNEL_CLOSE),
        (CALL_OPEN, CALL_CLOSE),
        (RESP_OPEN, RESP_CLOSE),
    )).replace(RESP_OPEN, "").strip()
    if prose:
        turn.content = prose

    if not turn.thoughts and not turn.tool_calls and not turn.content:
        turn.errors.append("empty model turn")
    if strict and turn.tool_calls and turn.content:
        turn.errors.append("step mixes tool_call with user-facing text")

    return turn


def parse_model_output(text: str) -> ParsedTurn:
    """One generation step, strictly. Never raises - malformed output is normal
    during training and eval, so problems come back in ``errors``."""
    return _parse(text, strict=True)


def parse_model_turn(text: str) -> ParsedTurn:
    """A whole model turn, which legitimately holds several thought/call/response
    cycles plus a final answer. Used for round-trip validation of training data."""
    return _parse(text, strict=False)


# --------------------------------------------------------------------------- #
# chat-template plumbing
# --------------------------------------------------------------------------- #

def to_chat_tools(tools: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """The template reads tool['function']['name'], so bare specs get wrapped."""
    out = []
    for spec in tools:
        out.append(spec if "function" in spec else {"type": "function", "function": spec})
    return out


def to_chat_messages(sample: Sample) -> list[dict[str, Any]]:
    """Internal Sample -> the message dicts the official template consumes.

    role="tool" messages are folded into the assistant message that made the
    calls, as ``tool_responses``. That is Gemma's native path and the only one
    that renders a structured ``response:name{k:v}`` block - the OpenAI-style
    ``role:tool`` path stuffs the whole payload into one escaped string, and
    passing a dict there crashes the template outright.
    """
    out: list[dict[str, Any]] = []
    if sample.system:
        out.append({"role": "system", "content": sample.system})

    for msg in sample.messages:
        if msg.role == "user":
            out.append({"role": "user", "content": msg.content or ""})

        elif msg.role == "assistant":
            entry: dict[str, Any] = {"role": "assistant"}
            if msg.thought:
                entry["reasoning"] = msg.thought
            if msg.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": f"call_{i}",
                        "type": "function",
                        "function": {"name": c.name, "arguments": c.arguments},
                    }
                    for i, c in enumerate(msg.tool_calls)
                ]
            if msg.content:
                entry["content"] = msg.content
            out.append(entry)

        else:  # tool
            for entry in reversed(out):
                if entry["role"] == "assistant" and entry.get("tool_calls"):
                    entry.setdefault("tool_responses", []).append(
                        {"name": msg.name or "unknown", "response": msg.result}
                    )
                    break
            else:
                raise ValueError("tool result with no preceding tool call")

    return out


def render(
    sample: Sample,
    tokenizer,
    add_generation_prompt: bool = False,
    enable_thinking: bool = True,
) -> str:
    """Render through the model's own chat template.

    Tokenize the result with ``add_special_tokens=False`` - the template already
    emits ``<bos>``.
    """
    return tokenizer.apply_chat_template(
        to_chat_messages(sample),
        tools=to_chat_tools(sample.tools) or None,
        tokenize=False,
        add_generation_prompt=add_generation_prompt,
        enable_thinking=enable_thinking,
        preserve_thinking=True,
    )


# --------------------------------------------------------------------------- #
# loss masking
# --------------------------------------------------------------------------- #

def control_ids(tokenizer) -> dict[str, int]:
    ids = {}
    for token in CONTROL_TOKENS:
        tid = tokenizer.convert_tokens_to_ids(token)
        if tid is None or tid == getattr(tokenizer, "unk_token_id", None):
            raise ValueError(
                f"{token!r} is not a single token in this tokenizer. "
                "protocol.py targets Gemma 4; check model.base_id."
            )
        ids[token] = tid
    return ids


def stop_token_ids(tokenizer) -> list[int]:
    """Where generation must halt: end of turn, and the point where the model
    hands control to the environment.

    Missing ``<|tool_response>`` here is the classic failure - the model sails
    past it and writes the tool's answer itself, then answers its own fiction.
    """
    ids = control_ids(tokenizer)
    out = [ids[TURN_CLOSE], ids[RESP_OPEN]]
    eos = tokenizer.eos_token_id
    for extra in (eos if isinstance(eos, (list, tuple)) else [eos]):
        if extra is not None and extra not in out:
            out.append(extra)
    return out


def build_loss_mask(
    input_ids: list[int],
    tokenizer,
    supervise_role: str = "model",
) -> list[int]:
    """Supervise the model's own tokens and nothing else.

    A token-level state machine, because in Gemma 4 a single model turn contains
    both the model's output and the environment's tool results:

        <|turn>model                       header      not supervised
          <|channel>thought ... <channel|>  model       supervised
          <|tool_call>call:f{...}<tool_call|>  model    supervised
          <|tool_response>                  model       supervised  <- stop signal
            response:f{...}                 ENVIRONMENT not supervised
          <tool_response|>                  ENVIRONMENT not supervised
          final answer                      model       supervised
        <turn|>                             model       supervised  <- stop token

    Supervising ``<|tool_response>`` and ``<turn|>`` is what teaches the model to
    stop. Leaving the response payload supervised is what teaches it to
    hallucinate tool output.
    """
    ids = control_ids(tokenizer)
    turn_open, turn_close = ids[TURN_OPEN], ids[TURN_CLOSE]
    resp_open, resp_close = ids[RESP_OPEN], ids[RESP_CLOSE]

    labels = [-100] * len(input_ids)
    in_target_turn = False
    in_response_payload = False
    i = 0

    while i < len(input_ids):
        token = input_ids[i]

        if token == turn_open:
            # Header runs to the first newline: <|turn> model \n
            j, role = i + 1, ""
            while j < len(input_ids):
                piece = tokenizer.decode([input_ids[j]])
                j += 1
                if "\n" in piece:
                    role += piece.split("\n", 1)[0]
                    break
                role += piece
            in_target_turn = role.strip() == supervise_role
            in_response_payload = False
            i = j
            continue

        if token == turn_close:
            if in_target_turn:
                labels[i] = token
            in_target_turn = False
            in_response_payload = False

        elif token == resp_open:
            if in_target_turn:
                labels[i] = token
            in_response_payload = True

        elif token == resp_close:
            in_response_payload = False

        elif in_target_turn and not in_response_payload:
            labels[i] = token

        i += 1

    return labels
