"""The agent loop: think -> call -> observe -> repeat -> answer.

    python -m flownote_agent.runtime.agent_loop \
        --adapter outputs/flownote-e2b-qlora/final \
        --ask "어제 standup 노트 찾아서 action item 추가해줘"

Gemma 4 runs the whole loop inside ONE model turn. The model generates up to
``<|tool_response>`` and stops; the environment appends
``response:name{...}<tool_response|>``; generation resumes from there and
eventually closes with ``<turn|>``. So each iteration below is a *continuation*
of the same turn, not a new one - which is why the loop rebuilds the prompt from
structured messages each step and lets the chat template emit the right
continuation prefix.

Two behaviours worth keeping when this moves into the FlowNote app:

1. A call that fails schema validation is fed back as a tool response carrying
   the validation error, not raised. That turns a hard failure into the
   self-correction pattern the model was trained on.

2. Context is budgeted, not merely truncated. Old tool results go first - they
   are the bulkiest and the least useful once the model has acted on them.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

from ..protocol import (
    DEFAULT_SYSTEM_KO,
    Message,
    Sample,
    ToolCall,
    parse_model_output,
    render,
)
from ..tools import ToolRegistry


class LLM(Protocol):
    def __call__(self, prompt: str, max_new_tokens: int = 512) -> str: ...


ToolFn = Callable[[dict[str, Any]], Any]


@dataclass
class Budget:
    """Context split, in tokens. Gemma 4 E2B supports 128K, but a smaller working
    window is faster and keeps the model from drowning in stale tool output."""
    total: int = 8192
    generation: int = 1024
    system_reserve: int = 2048

    @property
    def history(self) -> int:
        return max(512, self.total - self.generation - self.system_reserve)


@dataclass
class AgentLoop:
    llm: LLM
    registry: ToolRegistry
    executors: dict[str, ToolFn] = field(default_factory=dict)
    tokenizer: Any = None
    system: str = DEFAULT_SYSTEM_KO
    max_steps: int = 6
    budget: Budget = field(default_factory=Budget)
    verbose: bool = True

    def _log(self, label: str, body: str) -> None:
        if self.verbose:
            print(f"\n\033[1m[{label}]\033[0m {body}")

    def _tokens(self, text: str) -> int:
        if self.tokenizer is not None:
            return len(self.tokenizer(text, add_special_tokens=False)["input_ids"])
        return len(text) // 2

    def _render(self, messages: list[Message], specs: list[dict[str, Any]]) -> str:
        sample = Sample(messages=messages, tools=specs, system=self.system)
        if self.tokenizer is None:
            raise RuntimeError("AgentLoop needs a tokenizer to render prompts")
        return render(sample, self.tokenizer, add_generation_prompt=True)

    @staticmethod
    def _rounds(messages: list[Message]) -> list[list[Message]]:
        """Group into [assistant, its tool results...] blocks.

        Trimming has to respect these boundaries: a tool result whose assistant
        message was dropped has nothing to attach to, and the chat template
        rejects the conversation outright.
        """
        blocks: list[list[Message]] = []
        for msg in messages:
            if msg.role == "tool" and blocks:
                blocks[-1].append(msg)
            else:
                blocks.append([msg])
        return blocks

    def _weight(self, messages: list[Message]) -> int:
        parts = []
        for msg in messages:
            parts.append(msg.content or "")
            parts.append(msg.thought or "")
            for call in msg.tool_calls:
                parts.append(json.dumps(call.arguments, ensure_ascii=False, default=str))
            if msg.result is not None:
                parts.append(json.dumps(msg.result, ensure_ascii=False, default=str))
        return self._tokens("".join(parts))

    def trim_history(self, messages: list[Message]) -> list[Message]:
        """Shrink to fit ``budget.history``, sacrificing the least useful content
        first: bulky old tool payloads, then whole old rounds.

        The opening request and the most recent round are never dropped - the
        first is what the agent is trying to accomplish, the second is what it is
        reacting to right now.
        """
        blocks = self._rounds(messages)
        if len(blocks) <= 2:
            return messages
        head, tail = blocks[:1], blocks[-1:]
        middle = blocks[1:-1]

        def flatten(bs: list[list[Message]]) -> list[Message]:
            return [m for b in bs for m in b]

        def fits() -> bool:
            return self._weight(flatten(head + middle + tail)) <= self.budget.history

        # Pass 1: stub out large old tool payloads, oldest first.
        for msg in flatten(middle):
            if fits():
                return flatten(head + middle + tail)
            if msg.role == "tool" and msg.result is not None:
                blob = json.dumps(msg.result, ensure_ascii=False, default=str)
                if len(blob) > 160:
                    msg.result = {"elided": f"{len(blob)} chars", "head": blob[:120]}

        # Pass 2: drop whole rounds from the front.
        while middle and not fits():
            middle.pop(0)

        return flatten(head + middle + tail)

    def execute(self, call: ToolCall) -> Any:
        problems = self.registry.validate_call(call)
        if problems:
            return {"error": "invalid_arguments", "details": "; ".join(problems)}
        fn = self.executors.get(call.name)
        if fn is None:
            return {"error": "not_implemented",
                    "details": f"'{call.name}' has no executor wired up"}
        try:
            return fn(call.arguments)
        except Exception as exc:  # a tool crash is data, not a stack trace
            return {"error": type(exc).__name__, "details": str(exc)[:300]}

    def run(self, user_text: str, tool_subset: list[str] | None = None) -> str:
        messages: list[Message] = [Message(role="user", content=user_text)]
        specs = self.registry.specs(tool_subset)

        for step in range(1, self.max_steps + 1):
            messages = self.trim_history(messages)
            raw = self.llm(self._render(messages, specs),
                           max_new_tokens=self.budget.generation)
            turn = parse_model_output(raw)

            if turn.thought:
                self._log(f"thought {step}", turn.thought)
            for err in turn.errors:
                self._log("parse", err)

            if not turn.wants_tool:
                answer = turn.content or "(빈 응답)"
                messages.append(Message(role="assistant", thought=turn.thought,
                                        content=answer))
                self._log("answer", answer)
                return answer

            messages.append(Message(role="assistant", thought=turn.thought,
                                    tool_calls=turn.tool_calls))
            for call in turn.tool_calls:
                self._log("call", f"{call.name}("
                                  f"{json.dumps(call.arguments, ensure_ascii=False)})")
                result = self.execute(call)
                self._log("result", json.dumps(result, ensure_ascii=False, default=str)[:300])
                messages.append(Message(role="tool", name=call.name, result=result))

        self._log("stop", f"hit max_steps={self.max_steps}")
        return "요청이 너무 많은 단계를 필요로 해서 중단했습니다. 조금 더 구체적으로 알려주세요."


# --------------------------------------------------------------------------- #
# HF backend
# --------------------------------------------------------------------------- #

def hf_llm(base: str, adapter: str | None, load_in_4bit: bool = True):
    """Returns (llm_callable, tokenizer)."""
    import torch
    from transformers import AutoModelForImageTextToText, AutoTokenizer, BitsAndBytesConfig

    from ..protocol import stop_token_ids

    tok = AutoTokenizer.from_pretrained(adapter or base)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token

    quant = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
    ) if load_in_4bit else None

    model = AutoModelForImageTextToText.from_pretrained(
        base, dtype=torch.bfloat16, quantization_config=quant,
        device_map={"": 0} if torch.cuda.is_available() else "cpu",
    )
    if adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()

    stops = stop_token_ids(tok)

    def generate(prompt: str, max_new_tokens: int = 512) -> str:
        enc = tok(prompt, add_special_tokens=False, return_tensors="pt").to(model.device)
        with torch.no_grad():
            out = model.generate(
                **enc,
                max_new_tokens=max_new_tokens,
                # Gemma 4's own recommended sampling.
                do_sample=True, temperature=1.0, top_p=0.95, top_k=64,
                eos_token_id=stops, pad_token_id=tok.pad_token_id,
            )
        # skip_special_tokens=False on purpose: the control tokens ARE the output.
        return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=False)

    return generate, tok


def main() -> None:
    from .mock_tools import MOCK_EXECUTORS

    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="google/gemma-4-E2B-it")
    ap.add_argument("--adapter", default=None)
    ap.add_argument("--tools", default=None)
    ap.add_argument("--ask", default=None, help="one-shot; omit for a REPL")
    ap.add_argument("--max-steps", type=int, default=6)
    ap.add_argument("--context", type=int, default=8192)
    args = ap.parse_args()

    registry = ToolRegistry.load(args.tools) if args.tools else ToolRegistry.load()
    llm, tok = hf_llm(args.base, args.adapter)

    loop = AgentLoop(llm=llm, registry=registry, executors=MOCK_EXECUTORS,
                     tokenizer=tok, max_steps=args.max_steps,
                     budget=Budget(total=args.context))

    if args.ask:
        loop.run(args.ask)
        return

    print("FlowNote agent (mock tools). Ctrl-D to exit.")
    while True:
        try:
            line = input("\n> ").strip()
        except EOFError:
            return
        if line:
            loop.run(line)


if __name__ == "__main__":
    main()
