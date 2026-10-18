"""Tool registry + argument validation.

Used in three places, which is why it is shared:
  - data prep, to throw away synthetic examples that call tools wrongly
  - eval, to score whether a predicted call is actually executable
  - the runtime loop, to reject a bad call before it reaches real code
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .protocol import ToolCall

DEFAULT_TOOLS_PATH = Path(__file__).resolve().parents[2] / "configs" / "tools" / "flownote_tools.json"


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]

    def spec(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


class ToolRegistry:
    def __init__(self, tools: list[Tool]):
        self._tools = {t.name: t for t in tools}
        self._validators = {
            t.name: Draft202012Validator(t.parameters) for t in tools
        }

    @classmethod
    def load(cls, path: str | Path = DEFAULT_TOOLS_PATH) -> "ToolRegistry":
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls([Tool(**entry) for entry in raw])

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def __len__(self) -> int:
        return len(self._tools)

    @property
    def names(self) -> list[str]:
        return list(self._tools)

    def specs(self, subset: list[str] | None = None) -> list[dict[str, Any]]:
        names = subset if subset is not None else list(self._tools)
        return [self._tools[n].spec() for n in names if n in self._tools]

    def validate_call(self, call: ToolCall) -> list[str]:
        """Return a list of problems; empty means the call is executable."""
        if call.name not in self._tools:
            return [f"unknown tool '{call.name}'"]
        errors = sorted(
            self._validators[call.name].iter_errors(call.arguments),
            key=lambda e: list(e.path),
        )
        out = []
        for err in errors:
            where = "/".join(str(p) for p in err.path) or "(root)"
            out.append(f"{call.name}.{where}: {err.message}")
        return out
