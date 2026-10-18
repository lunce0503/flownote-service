"""Measure whether the agent's tool calls are actually usable.

    python -m flownote_agent.eval.tool_eval \
        --adapter outputs/flownote-e2b-qlora/final \
        --data data/processed/eval.jsonl

Teacher-forced: for every assistant step in the reference conversation we feed
the ground-truth prefix, generate one step, and score it. That isolates "did it
pick the right call here" from "did it survive ten steps", which is what you want
while iterating on the SFT mix.

Run it once WITHOUT --adapter first. Gemma 4 is already instruction-tuned with
native tool-calling, so the base model scores well; if your fine-tune does not
beat that baseline, it did not earn its GPU hours.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import torch

from ..data.converters import from_internal
from ..protocol import Sample, parse_model_output, render, stop_token_ids
from ..tools import ToolRegistry


def steps(sample: Sample, tokenizer) -> list[tuple[str, int]]:
    """(prompt ending at the point the model must continue, assistant index)."""
    out = []
    for idx, msg in enumerate(sample.messages):
        if msg.role != "assistant":
            continue
        prefix = Sample(
            messages=sample.messages[:idx],
            tools=sample.tools,
            system=sample.system,
            lang=sample.lang,
            source=sample.source,
        )
        out.append((render(prefix, tokenizer, add_generation_prompt=True), idx))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="google/gemma-4-E2B-it")
    ap.add_argument("--adapter", default=None, help="omit to score the base model")
    ap.add_argument("--data", default="data/processed/eval.jsonl")
    ap.add_argument("--tools", default=None)
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--max-new-tokens", type=int, default=512)
    ap.add_argument("--greedy", action="store_true",
                    help="deterministic decoding; default follows Gemma 4's "
                         "recommended temperature=1.0/top_p=0.95/top_k=64")
    ap.add_argument("--no-4bit", action="store_true")
    ap.add_argument("--dump", default=None, help="write per-step results to jsonl")
    args = ap.parse_args()

    from transformers import AutoModelForImageTextToText, AutoTokenizer, BitsAndBytesConfig

    registry = ToolRegistry.load(args.tools) if args.tools else ToolRegistry.load()
    tok = AutoTokenizer.from_pretrained(args.adapter or args.base)
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token

    quant = None if args.no_4bit else BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForImageTextToText.from_pretrained(
        args.base, dtype=torch.bfloat16, quantization_config=quant,
        device_map={"": 0} if torch.cuda.is_available() else "cpu",
    )
    if args.adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, args.adapter)
    model.eval()

    stops = stop_token_ids(tok)
    sampling = dict(do_sample=False) if args.greedy else dict(
        do_sample=True, temperature=1.0, top_p=0.95, top_k=64)

    m: Counter = Counter()
    rows = []
    with Path(args.data).open(encoding="utf-8") as fh:
        lines = [l for l in (x.strip() for x in fh) if l][: args.limit]

    for n, line in enumerate(lines, 1):
        sample = from_internal(json.loads(line))
        if sample is None:
            continue
        for prompt, idx in steps(sample, tok):
            ref = sample.messages[idx]
            enc = tok(prompt, add_special_tokens=False, return_tensors="pt").to(model.device)
            with torch.no_grad():
                gen = model.generate(
                    **enc, max_new_tokens=args.max_new_tokens,
                    eos_token_id=stops, pad_token_id=tok.pad_token_id, **sampling,
                )
            text = tok.decode(gen[0][enc["input_ids"].shape[1]:], skip_special_tokens=False)
            pred = parse_model_output(text)

            m["steps"] += 1
            if pred.ok:
                m["format_ok"] += 1
            if pred.thought:
                m["has_thought"] += 1

            want = [(c.name, c.arguments) for c in ref.tool_calls]
            got = [(c.name, c.arguments) for c in pred.tool_calls]

            if not want and not got:
                m["correct_abstain"] += 1
            if not want and got:
                m["over_call"] += 1
            if want and not got:
                m["missed_call"] += 1
            if want:
                m["want_call_steps"] += 1
                if [name for name, _ in got] == [name for name, _ in want]:
                    m["name_exact"] += 1
                if got == want:
                    m["args_exact"] += 1

            declared = {t.get("name") for t in sample.tools}
            for call in pred.tool_calls:
                m["calls"] += 1
                if call.name not in declared:
                    m["hallucinated_tool"] += 1
                elif call.name not in registry:
                    # From a public dataset's own schema set, which we do not
                    # carry - can't verify, so don't claim we did.
                    m["schema_unverifiable"] += 1
                elif registry.validate_call(call):
                    m["schema_bad"] += 1
                else:
                    m["schema_ok"] += 1

            if args.dump:
                rows.append({"id": sample.id, "step": idx, "lang": sample.lang,
                             "expected": want, "got": got,
                             "errors": pred.errors, "raw": text})
        if n % 20 == 0:
            print(f"  {n}/{len(lines)}", flush=True)

    total = max(1, m["steps"])
    calls = max(1, m["calls"])
    want_steps = max(1, m["want_call_steps"])
    verifiable = max(1, m["schema_ok"] + m["schema_bad"])

    print(f"\n=== {args.adapter or args.base} ===")
    print(f"steps evaluated            {m['steps']}  ({m['want_call_steps']} expect a call)")
    print(f"parses cleanly             {m['format_ok'] / total:.1%}")
    print(f"emitted a thought          {m['has_thought'] / total:.1%}")
    print(f"tool name exact            {m['name_exact'] / want_steps:.1%}")
    print(f"full args exact            {m['args_exact'] / want_steps:.1%}")
    print(f"schema-valid calls         {m['schema_ok'] / verifiable:.1%}"
          f"  ({verifiable}/{calls} verifiable against our registry)")
    print(f"hallucinated tools         {m['hallucinated_tool'] / calls:.1%}")
    print(f"missed a needed call       {m['missed_call'] / total:.1%}")
    print(f"called when it should not  {m['over_call'] / total:.1%}")

    if args.dump:
        Path(args.dump).parent.mkdir(parents=True, exist_ok=True)
        with Path(args.dump).open("w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"\nper-step results -> {args.dump}")


if __name__ == "__main__":
    main()
