"""Structural + semantic checks on a Sample before it reaches the trainer.

The rule this file exists to enforce: never train on an example whose target the
runtime parser cannot read back.

Two levels of round-trip:
  - always: serialise each tool call with the Gemma 4 encoder and parse it back,
    which validates the value grammar without needing any model files
  - optionally (pass a tokenizer): render the whole conversation through the real
    chat template and re-parse the model turn
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from ..protocol import (
    TURN_OPEN,
    Sample,
    format_tool_call,
    parse_model_output,
    parse_model_turn,
    render,
)
from ..tools import ToolRegistry


@dataclass
class Report:
    kept: int = 0
    rejected: Counter = field(default_factory=Counter)

    def reject(self, reason: str) -> None:
        self.rejected[reason] += 1

    @property
    def total(self) -> int:
        return self.kept + sum(self.rejected.values())

    def render(self) -> str:
        lines = [f"kept {self.kept}/{self.total}"]
        for reason, n in self.rejected.most_common():
            lines.append(f"  - {reason}: {n}")
        return "\n".join(lines)


def check(
    sample: Sample,
    registry: ToolRegistry | None = None,
    strict_tools: bool = False,
    tokenizer=None,
) -> list[str]:
    """Return a list of problems. Empty list means the sample is usable.

    ``strict_tools``: also require every called tool to exist in ``registry`` and
    its arguments to validate against the schema. On for our own FlowNote data;
    off for public datasets, which carry their own thousands of schemas.
    """
    problems: list[str] = []
    msgs = sample.messages

    if not msgs:
        return ["no messages"]
    if msgs[0].role != "user":
        problems.append("does not start with a user turn")
    if msgs[-1].role != "assistant":
        problems.append("does not end with an assistant turn")

    prev = None
    open_calls = 0
    for msg in msgs:
        if msg.role == "assistant":
            if not (msg.thought or msg.tool_calls or msg.content):
                problems.append("empty assistant turn")
            if msg.tool_calls and msg.content:
                problems.append("assistant step mixes tool_call with prose")
            if prev == "assistant":
                problems.append("two assistant turns in a row")
            open_calls = len(msg.tool_calls)
        elif msg.role == "tool":
            if prev not in ("assistant", "tool"):
                problems.append("tool result not preceded by a tool call")
            if not msg.name:
                problems.append("tool result missing name")
            open_calls -= 1
            if open_calls < 0:
                problems.append("more tool results than tool calls")
        prev = msg.role

    if registry is not None:
        declared = {t.get("name") for t in sample.tools}
        for msg in msgs:
            for call in msg.tool_calls:
                if strict_tools:
                    problems.extend(registry.validate_call(call))
                elif sample.tools and call.name not in declared:
                    problems.append(f"calls undeclared tool '{call.name}'")

    # --- grammar round-trip: encode each call, read it back ------------------
    for msg in msgs:
        for call in msg.tool_calls:
            parsed = parse_model_output(format_tool_call(call))
            if parsed.errors:
                problems.extend(f"round-trip: {e}" for e in parsed.errors)
                continue
            if not parsed.tool_calls:
                problems.append(f"round-trip: '{call.name}' vanished on re-parse")
                continue
            back = parsed.tool_calls[0]
            if back.name != call.name or back.arguments != call.arguments:
                problems.append(
                    f"round-trip: '{call.name}' arguments changed "
                    f"({call.arguments} -> {back.arguments})"
                )

    # --- full template round-trip (needs a tokenizer) -----------------------
    if tokenizer is not None:
        try:
            text = render(sample, tokenizer)
        except Exception as exc:  # noqa: BLE001
            return problems + [f"chat template failed: {type(exc).__name__}: {exc}"]

        expected_calls = [(c.name, c.arguments) for m in msgs for c in m.tool_calls]
        got_calls: list[tuple[str, dict]] = []
        for chunk in text.split(f"{TURN_OPEN}model\n")[1:]:
            turn = parse_model_turn(chunk)
            problems.extend(f"template round-trip: {e}" for e in turn.errors)
            got_calls.extend((c.name, c.arguments) for c in turn.tool_calls)
        if got_calls != expected_calls:
            problems.append("template round-trip: tool calls changed after re-parse")

    return problems
