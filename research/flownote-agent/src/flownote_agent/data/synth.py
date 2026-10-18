"""Generate FlowNote-specific agent data with a teacher model.

    export ANTHROPIC_API_KEY=...
    python -m flownote_agent.data.synth --n 2000 --out data/processed/synth.jsonl

This is the slice that decides whether the agent actually works, because it is
the only data that sees your real tool schemas. Public function-calling sets
teach the *shape* of a tool call; this teaches which of YOUR tools to reach for.

Every generated conversation is validated against the real JSON Schemas before
it is written, and failures are counted, not silently dropped.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from ..protocol import DEFAULT_SYSTEM_KO
from ..tools import ToolRegistry
from .converters import from_internal
from .validate import check

# Cost per accepted conversation, assuming ~1.4k input / ~1.2k output tokens per
# attempt (thinking is billed as output and is ON by default on Opus 5) and a
# ~70% validation pass rate:
#
#   claude-opus-5     $5 / $25 per MTok   ~$0.053  ->  2,000 conversations ~$105
#   claude-sonnet-5   $3 / $15            ~$0.032  ->  2,000 ~$64
#   claude-haiku-4-5  $1 / $5             ~$0.011  ->  2,000 ~$22
#
# Opus 5 is the default because the hard scenarios (multi-step, error recovery,
# clarify) are where teacher quality actually shows up in the trained model.
# Generate those with Opus and the easy single-call bulk with --model
# claude-sonnet-5 if the budget is tight.
TEACHER_MODEL = "claude-opus-5"

# The distribution matters more than the volume. A model trained only on
# happy-path single calls will confidently invent arguments the moment anything
# is missing, so the awkward cases get real weight here.
SCENARIOS = [
    ("single_call", 0.22, "사용자 요청 한 개 → 도구 1회 호출 → 결과를 받아 자연어로 요약."),
    ("multi_step", 0.22,
     "도구를 2~3번 순차로 호출해야 하는 요청. 앞 호출의 결과가 다음 호출의 인자가 되어야 한다 "
     "(예: search_notes로 note_id를 찾고 그 id로 update_note)."),
    ("parallel_call", 0.10,
     "서로 독립적인 도구 2개를 같은 턴에서 동시에 호출 (tool_call 블록 2개)."),
    ("error_recovery", 0.16,
     "첫 호출이 실패한다 (tool result에 {\"error\": ...} 또는 빈 결과). 에이전트는 원인을 "
     "읽고 인자를 고쳐 재시도하거나, 다른 도구로 우회한다."),
    ("clarify", 0.12,
     "필수 인자를 확정할 수 없는 모호한 요청. 에이전트는 절대 값을 추측하지 않고 "
     "도구 호출 없이 사용자에게 되묻는다."),
    ("no_tool", 0.10,
     "도구가 전혀 필요 없는 요청 (일반 질문, 잡담). thought 후 바로 답한다. tool_call 없음."),
    ("refuse_confirm", 0.08,
     "delete_note처럼 되돌릴 수 없는 작업 요청. 에이전트는 confirm=true로 바로 실행하지 않고 "
     "먼저 사용자 확인을 요청한다."),
]

LANG_MIX = [
    ("ko", 0.50, "사용자 발화는 한국어."),
    ("en", 0.30, "User speaks English."),
    ("mixed", 0.20,
     "사용자 발화는 한국어인데 고유명사·기술용어·태그는 영어를 섞어 쓴다 "
     "(예: \"어제 standup 노트에 action item 추가해줘\")."),
]

PROMPT = """\
You are generating training data for FlowNote's on-device note-taking agent.

# Available tools (JSON Schema - obey them exactly)
{tool_specs}

# Scenario to write: {scenario_name}
{scenario_desc}

# Language: {lang_desc}

# Output format
Return ONE JSON object and nothing else. No markdown fence, no commentary.

{{
  "messages": [
    {{"role": "user", "content": "..."}},
    {{"role": "assistant", "thought": "...", "tool_calls": [{{"name": "...", "arguments": {{...}}}}]}},
    {{"role": "tool", "name": "...", "result": {{...}}}},
    {{"role": "assistant", "content": "..."}}
  ]
}}

# Hard rules
- Must start with a "user" message and end with an "assistant" message.
- An assistant message has EITHER tool_calls OR content, never both. "thought" is
  always present on every assistant message.
- "thought" is 1-2 short sentences of actual planning, in the user's language.
  Not a restatement of the request.
- Every argument must satisfy that tool's schema: correct types, all required
  fields present, enum values from the allowed list only.
- Never invent a tool that is not listed above.
- "result" is a plausible tool return value you make up - realistic ids
  (e.g. "note_8f3a1c"), realistic ISO 8601 timestamps with +09:00 offset.
- Any relative time ("30분 뒤", "tomorrow morning") requires a get_current_time
  call BEFORE the call that consumes the resolved timestamp.
- The final assistant message answers in the user's language and mentions the
  concrete result, not "작업을 완료했습니다".

# Diversity (this matters - there is no temperature knob on this model)
Make this conversation deliberately unlike the obvious one. Pick an off-centre
domain and phrasing rather than the first thing that comes to mind: work
meetings, study notes, recipes, travel planning, reading logs, code snippets,
personal journal, medical appointments, apartment hunting, gift ideas, gym
routines. Vary sentence length and register too - some users are terse and
type in fragments, some are chatty and over-explain, some paste in raw text.
"""


def pick(options: list[tuple[str, float, str]], rng: random.Random) -> tuple[str, str]:
    r = rng.random()
    acc = 0.0
    for name, weight, desc in options:
        acc += weight
        if r <= acc:
            return name, desc
    return options[-1][0], options[-1][2]


def build_prompt(registry: ToolRegistry, rng: random.Random) -> tuple[str, str, str, list[str]]:
    """Show a random subset of tools. Always showing all 14 teaches the model that
    the tool list is a constant it can ignore; a varying list forces it to read."""
    k = rng.randint(4, min(8, len(registry)))
    subset = rng.sample(registry.names, k)
    # 'clarify' and relative-time scenarios need their protagonists present.
    scenario_name, scenario_desc = pick(SCENARIOS, rng)
    if scenario_name == "refuse_confirm" and "delete_note" not in subset:
        subset[0] = "delete_note"
    lang, lang_desc = pick(LANG_MIX, rng)

    specs = "\n".join(
        json.dumps(s, ensure_ascii=False) for s in registry.specs(subset)
    )
    return (
        PROMPT.format(
            tool_specs=specs,
            scenario_name=scenario_name,
            scenario_desc=scenario_desc,
            lang_desc=lang_desc,
        ),
        scenario_name,
        lang,
        subset,
    )


def strip_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


def generate_one(
    client: Any,
    registry: ToolRegistry,
    rng: random.Random,
    index: int,
    model: str = TEACHER_MODEL,
    effort: str = "medium",
) -> tuple[dict[str, Any] | None, str]:
    prompt, scenario, lang, subset = build_prompt(registry, rng)
    try:
        resp = client.messages.create(
            model=model,
            # Thinking is on by default on Opus 5 and counts against max_tokens,
            # so this has to cover reasoning AND the ~700-token conversation.
            max_tokens=4096,
            output_config={"effort": effort},
            # No temperature: it was removed on Opus 5 / Sonnet 5 and returns a
            # 400. Output diversity comes from the prompt instead - the random
            # tool subset, the scenario mix, and the explicit "vary the domain"
            # rule below.
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        return None, f"api error: {type(exc).__name__}"

    # Safety classifiers can decline with a normal HTTP 200; content is then
    # empty or partial, so this has to be checked before reading it.
    if resp.stop_reason == "refusal":
        category = getattr(getattr(resp, "stop_details", None), "category", None)
        return None, f"teacher refused ({category})"
    if resp.stop_reason == "max_tokens":
        return None, "teacher hit max_tokens (raise it or lower effort)"

    raw = strip_fence("".join(b.text for b in resp.content if b.type == "text"))
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return None, "teacher returned invalid JSON"

    row = {
        "id": f"synth-{scenario}-{index:06d}",
        "source": "flownote_synth",
        "lang": lang,
        "system": DEFAULT_SYSTEM_KO,
        "tools": registry.specs(subset),
        "messages": obj.get("messages", []),
    }

    sample = from_internal(row)
    if sample is None:
        return None, "unparseable message list"
    problems = check(sample, registry=registry, strict_tools=True)
    if problems:
        return None, problems[0][:90]

    # Scenario-specific expectations, so a teacher that ignores the brief on
    # the hard cases shows up in the report instead of quietly diluting the mix.
    has_call = any(m.tool_calls for m in sample.messages)
    if scenario in ("clarify", "no_tool") and has_call:
        return None, f"{scenario}: expected no tool call"
    if scenario not in ("clarify", "no_tool") and not has_call:
        return None, f"{scenario}: expected a tool call"

    return row, "ok"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500, help="conversations to accept")
    ap.add_argument("--out", default="data/processed/synth.jsonl")
    ap.add_argument("--tools", default=None)
    ap.add_argument("--model", default=TEACHER_MODEL,
                    help="teacher model; claude-sonnet-5 is ~40%% cheaper, "
                         "claude-haiku-4-5 ~80%% cheaper (see cost table at the "
                         "top of this file)")
    ap.add_argument("--effort", default="medium",
                    choices=["low", "medium", "high", "xhigh", "max"],
                    help="teacher reasoning depth; low is enough for "
                         "single_call, medium+ pays off on multi_step and "
                         "error_recovery")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true",
                    help="print one prompt and exit, no API calls")
    args = ap.parse_args()

    registry = ToolRegistry.load(args.tools) if args.tools else ToolRegistry.load()
    rng = random.Random(args.seed)

    if args.dry_run:
        prompt, scenario, lang, _ = build_prompt(registry, rng)
        print(f"--- scenario={scenario} lang={lang} ---\n{prompt}")
        return

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY is not set (see .env.example)")

    from anthropic import Anthropic

    client = Anthropic()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    stats: Counter = Counter()
    written = 0
    attempts = 0
    max_attempts = args.n * 3

    with out_path.open("w", encoding="utf-8") as fh, \
            ThreadPoolExecutor(max_workers=args.workers) as pool:
        while written < args.n and attempts < max_attempts:
            batch = min(args.workers * 4, (args.n - written) * 2)
            seeds = [random.Random(rng.randrange(1 << 30)) for _ in range(batch)]
            futures = [
                pool.submit(generate_one, client, registry, s, attempts + i,
                            args.model, args.effort)
                for i, s in enumerate(seeds)
            ]
            attempts += batch
            for fut in futures:
                row, status = fut.result()
                stats[status] += 1
                if row is not None and written < args.n:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                    written += 1
            print(f"  accepted {written}/{args.n}  (attempts {attempts})", flush=True)

    print(f"\nwrote {written} -> {out_path}")
    print("outcomes:")
    for status, n in stats.most_common():
        print(f"  {status:<50} {n:>5}")
    if written < args.n:
        print("\nhit the attempt cap. The most common rejection above is the thing "
              "to fix - usually a prompt rule the teacher is ignoring.")


if __name__ == "__main__":
    main()
