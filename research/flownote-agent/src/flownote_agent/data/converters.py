"""Converters from public dataset layouts into the internal Sample format.

Every converter returns ``Sample | None``. Returning None is the normal way to
reject a row - these datasets are large and messy, and a converter that raises
turns one bad row into a dead pipeline.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

from ..protocol import DEFAULT_SYSTEM_KO, Message, Sample, ToolCall

GENERAL_SYSTEM_KO = (
    "너는 FlowNote의 어시스턴트다. 사용자의 언어로 정확하고 간결하게 답한다."
)
CODE_SYSTEM = (
    "You are FlowNote's coding assistant. Answer with correct, runnable code and "
    "a short explanation. Match the user's language."
)

_HANGUL = re.compile(r"[가-힣]")
_LATIN_WORD = re.compile(r"[A-Za-z]{2,}")


def detect_lang(text: str) -> str:
    """ko / en / mixed, by character-class share. Cheap and good enough for
    balancing a training mix; not a real language ID."""
    ko = len(_HANGUL.findall(text))
    en = len(_LATIN_WORD.findall(text))
    if ko and en:
        ratio = ko / (ko + en)
        if 0.2 < ratio < 0.85:
            return "mixed"
    return "ko" if ko > en else "en"


def _loads_maybe(value: Any) -> Any:
    """These datasets nest JSON inside strings, sometimes twice."""
    for _ in range(2):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return value
        else:
            break
    return value


def _normalize_tool_spec(spec: Any) -> dict[str, Any] | None:
    """Public datasets disagree on where the schema lives. Flatten to
    {name, description, parameters}."""
    if not isinstance(spec, dict):
        return None
    if "function" in spec and isinstance(spec["function"], dict):
        spec = spec["function"]
    name = spec.get("name")
    if not isinstance(name, str) or not name:
        return None
    params = spec.get("parameters") or spec.get("input_schema") or {}
    if isinstance(params, dict) and params and "type" not in params:
        # xLAM lists params as {argname: {type, description}} with no wrapper.
        required = [k for k, v in params.items()
                    if isinstance(v, dict) and not v.get("optional", False)
                    and v.get("default") is None]
        params = {"type": "object", "properties": params, "required": required}
    return {
        "name": name,
        "description": str(spec.get("description", ""))[:400],
        "parameters": params if isinstance(params, dict) else {},
    }


# --------------------------------------------------------------------------- #
# agent / tool-calling sources
# --------------------------------------------------------------------------- #

def from_xlam(row: dict[str, Any]) -> Sample | None:
    """Salesforce/xlam-function-calling-60k - single-turn, parallel calls, no CoT."""
    query = row.get("query")
    if not isinstance(query, str) or not query.strip():
        return None

    tools = [t for t in (_normalize_tool_spec(t) for t in (_loads_maybe(row.get("tools")) or [])) if t]
    answers = _loads_maybe(row.get("answers"))
    if not isinstance(answers, list) or not answers or not tools:
        return None

    calls = []
    for ans in answers:
        if not isinstance(ans, dict):
            return None
        name = ans.get("name")
        args = _loads_maybe(ans.get("arguments", {}))
        if not isinstance(name, str) or not isinstance(args, dict):
            return None
        calls.append(ToolCall(name=name, arguments=args))

    # xLAM has no reasoning field. Rather than fabricate a thought, we synthesise
    # a terse factual one so the tag is always present in the target - a model
    # trained on a mix of "thought present" and "thought absent" learns to skip
    # it, which is exactly the behaviour we do not want.
    tool_names = ", ".join(dict.fromkeys(c.name for c in calls))
    thought = f"Call {tool_names} to answer the request."

    return Sample(
        tools=tools,
        system=DEFAULT_SYSTEM_KO,
        lang=detect_lang(query),
        source="xlam",
        id=str(row.get("id")) if row.get("id") is not None else None,
        messages=[
            Message(role="user", content=query),
            Message(role="assistant", thought=thought, tool_calls=calls),
        ],
    )


_GLAIVE_SPLIT = re.compile(r"(USER:|ASSISTANT:|FUNCTION RESPONSE:)")


def from_glaive(row: dict[str, Any]) -> Sample | None:
    """glaiveai/glaive-function-calling-v2 - multi-turn with real tool results.

    Stored as one flat transcript string with `USER:` / `ASSISTANT:` /
    `FUNCTION RESPONSE:` markers, `<functioncall>` for calls, and `<|endoftext|>`
    as the turn terminator.
    """
    chat = row.get("chat")
    if not isinstance(chat, str) or not chat.strip():
        return None

    system_raw = row.get("system") or ""
    tools: list[dict[str, Any]] = []
    for match in re.finditer(r"\{.*?\}(?=\s*\{|\s*$)", system_raw, re.DOTALL):
        spec = _normalize_tool_spec(_loads_maybe(match.group(0)))
        if spec:
            tools.append(spec)
    if not tools:
        return None

    parts = _GLAIVE_SPLIT.split(chat)
    messages: list[Message] = []
    pending_call_name: str | None = None
    i = 1
    while i < len(parts) - 1:
        marker, body = parts[i], parts[i + 1]
        body = body.replace("<|endoftext|>", "").strip()
        i += 2
        if not body:
            continue

        if marker == "USER:":
            messages.append(Message(role="user", content=body))

        elif marker == "ASSISTANT:":
            if "<functioncall>" in body:
                raw = body.split("<functioncall>", 1)[1].strip()
                # Glaive double-encodes: arguments is a string of JSON, and the
                # outer object sometimes uses single quotes around it.
                obj = _loads_maybe(raw.replace("'{", "{").replace("}'", "}"))
                if not isinstance(obj, dict):
                    return None
                name = obj.get("name")
                args = _loads_maybe(obj.get("arguments", {}))
                if not isinstance(name, str) or not isinstance(args, dict):
                    return None
                pending_call_name = name
                messages.append(Message(
                    role="assistant",
                    thought=f"Need {name} to continue.",
                    tool_calls=[ToolCall(name=name, arguments=args)],
                ))
            else:
                messages.append(Message(role="assistant", content=body))

        else:  # FUNCTION RESPONSE:
            result = _loads_maybe(body)
            messages.append(Message(
                role="tool",
                name=pending_call_name or "unknown",
                result=result,
            ))

    if len(messages) < 2 or messages[0].role != "user":
        return None
    if messages[-1].role != "assistant":
        # Trailing tool result with no summary - nothing to train on.
        return None
    if not any(m.tool_calls for m in messages):
        return None

    joined = " ".join(m.content or "" for m in messages if m.role == "user")
    return Sample(
        tools=tools,
        system=DEFAULT_SYSTEM_KO,
        lang=detect_lang(joined),
        source="glaive",
        messages=messages,
    )


# --------------------------------------------------------------------------- #
# general instruction / code sources
# --------------------------------------------------------------------------- #

def from_sharegpt(row: dict[str, Any]) -> Sample | None:
    """OpenHermes-2.5 style: {"conversations": [{"from", "value"}, ...]}"""
    convs = row.get("conversations")
    if not isinstance(convs, list) or len(convs) < 2:
        return None
    role_map = {"human": "user", "user": "user", "gpt": "assistant", "assistant": "assistant"}
    system = GENERAL_SYSTEM_KO
    messages: list[Message] = []
    for turn in convs:
        if not isinstance(turn, dict):
            return None
        frm, val = turn.get("from"), turn.get("value")
        if not isinstance(val, str) or not val.strip():
            continue
        if frm == "system":
            system = val.strip()
            continue
        role = role_map.get(frm)
        if role is None:
            return None
        messages.append(Message(role=role, content=val.strip()))

    if len(messages) < 2 or messages[0].role != "user" or messages[-1].role != "assistant":
        return None
    joined = " ".join(m.content or "" for m in messages)
    return Sample(tools=[], system=system, lang=detect_lang(joined),
                  source="sharegpt", messages=messages)


def from_alpaca(row: dict[str, Any]) -> Sample | None:
    """instruction / input / output - kullm-v2, koalpaca, most Korean SFT sets."""
    instruction = row.get("instruction")
    output = row.get("output")
    if not isinstance(instruction, str) or not isinstance(output, str):
        return None
    if not instruction.strip() or not output.strip():
        return None
    extra = row.get("input")
    user = instruction.strip()
    if isinstance(extra, str) and extra.strip():
        user = f"{user}\n\n{extra.strip()}"
    return Sample(
        tools=[], system=GENERAL_SYSTEM_KO, lang=detect_lang(user + output),
        source="alpaca",
        messages=[Message(role="user", content=user),
                  Message(role="assistant", content=output.strip())],
    )


def from_magicoder(row: dict[str, Any]) -> Sample | None:
    """ise-uiuc/Magicoder-OSS-Instruct-75K - {"problem", "solution"}"""
    problem, solution = row.get("problem"), row.get("solution")
    if not isinstance(problem, str) or not isinstance(solution, str):
        return None
    if not problem.strip() or not solution.strip():
        return None
    return Sample(
        tools=[], system=CODE_SYSTEM, lang="en", source="magicoder",
        messages=[Message(role="user", content=problem.strip()),
                  Message(role="assistant", content=solution.strip())],
    )


def from_internal(row: dict[str, Any]) -> Sample | None:
    """Our own jsonl (seed set, synthetic output, JSON drills)."""
    msgs_raw = row.get("messages")
    if not isinstance(msgs_raw, list) or not msgs_raw:
        return None
    messages: list[Message] = []
    for m in msgs_raw:
        if not isinstance(m, dict):
            return None
        role = m.get("role")
        if role not in ("user", "assistant", "tool"):
            return None
        calls = [
            ToolCall(name=c["name"], arguments=c.get("arguments", {}))
            for c in m.get("tool_calls", [])
            if isinstance(c, dict) and isinstance(c.get("name"), str)
        ]
        messages.append(Message(
            role=role,
            content=m.get("content"),
            thought=m.get("thought"),
            tool_calls=calls,
            name=m.get("name"),
            result=m.get("result"),
        ))
    joined = " ".join(m.content or "" for m in messages if m.role == "user")
    return Sample(
        tools=row.get("tools") or [],
        system=row.get("system") or DEFAULT_SYSTEM_KO,
        lang=row.get("lang") or detect_lang(joined),
        source=row.get("source") or "internal",
        id=row.get("id"),
        messages=messages,
    )


CONVERTERS: dict[str, Callable[[dict[str, Any]], Sample | None]] = {
    "xlam": from_xlam,
    "glaive": from_glaive,
    "sharegpt": from_sharegpt,
    "alpaca": from_alpaca,
    "magicoder": from_magicoder,
    "passthrough": from_internal,
}


def sample_to_row(sample: Sample) -> dict[str, Any]:
    """Inverse of from_internal, for writing our jsonl files."""
    messages = []
    for m in sample.messages:
        entry: dict[str, Any] = {"role": m.role}
        if m.content is not None:
            entry["content"] = m.content
        if m.thought:
            entry["thought"] = m.thought
        if m.tool_calls:
            entry["tool_calls"] = [{"name": c.name, "arguments": c.arguments} for c in m.tool_calls]
        if m.name:
            entry["name"] = m.name
        if m.result is not None:
            entry["result"] = m.result
        messages.append(entry)
    return {
        "id": sample.id,
        "source": sample.source,
        "lang": sample.lang,
        "system": sample.system,
        "tools": sample.tools,
        "messages": messages,
    }
