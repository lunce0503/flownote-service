"""Build the SFT mix described by configs/data_mix.yaml.

    python -m flownote_agent.data.build_dataset --config configs/data_mix.yaml

Streams each source so you never need the full 60k/75k download on disk, drops
anything that fails validation, samples to the configured weights, then writes
data/processed/{train,eval}.jsonl and prints what it actually achieved. The
report matters: if a source rejects 80% of its rows, the mix you trained on is
not the mix you designed.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterator

import yaml

from ..protocol import Sample
from ..tools import ToolRegistry
from .converters import CONVERTERS, sample_to_row
from .validate import Report, check


def iter_hf(repo: str, split: str, limit: int) -> Iterator[dict[str, Any]]:
    from datasets import load_dataset

    ds = load_dataset(repo, split=split, streaming=True)
    for i, row in enumerate(ds):
        if i >= limit:
            return
        yield row


def iter_local(path: str | Path, limit: int) -> Iterator[dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        return
    with p.open(encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            if i >= limit:
                return
            line = line.strip()
            if line:
                yield json.loads(line)


def collect_source(
    spec: dict[str, Any],
    target: int,
    registry: ToolRegistry,
    oversample: float = 3.0,
) -> tuple[list[Sample], Report]:
    """Pull rows until we have ``target`` valid samples, reading at most
    ``target * oversample`` rows so a badly-matching converter fails loudly
    instead of streaming a whole dataset."""
    convert = CONVERTERS[spec["converter"]]
    strict = spec.get("converter") == "passthrough"
    budget = int(target * oversample) + 100

    rows = (
        iter_hf(spec["repo"], spec.get("split", "train"), budget)
        if spec["kind"] == "hf"
        else iter_local(spec["path"], budget)
    )

    report = Report()
    kept: list[Sample] = []
    for row in rows:
        if len(kept) >= target:
            break
        try:
            sample = convert(row)
        except Exception as exc:  # a converter bug must not kill the build
            report.reject(f"converter raised {type(exc).__name__}")
            continue
        if sample is None:
            report.reject("converter rejected row")
            continue
        problems = check(sample, registry=registry, strict_tools=strict)
        if problems:
            report.reject(problems[0][:80])
            continue
        sample.source = spec["name"]
        kept.append(sample)
        report.kept += 1
    return kept, report


MIN_BALANCE_RETENTION = 0.5


def enforce_language_targets(
    samples: list[Sample],
    targets: dict[str, float],
    rng: random.Random,
) -> list[Sample]:
    """Trim over-represented languages down to their target share.

    Only ever removes - duplicating scarce Korean data to hit a ratio teaches
    memorisation, not Korean.

    Hitting exact ratios is capped by the scarcest language, so a source mix
    that is short on one language can only be balanced by discarding most of
    the others. When that would cost more than half the corpus we refuse,
    return the data unbalanced, and name the bottleneck - throwing away 90% of
    a hard-won dataset to satisfy a config ratio is not a trade the builder
    gets to make silently.
    """
    if not targets or not samples:
        return samples

    buckets: dict[str, list[Sample]] = defaultdict(list)
    for s in samples:
        buckets[s.lang].append(s)
    for pool in buckets.values():
        rng.shuffle(pool)

    shares = {lang: share for lang, share in targets.items() if share > 0}
    # Largest total for which every language can supply its share.
    caps = {lang: len(buckets.get(lang, [])) / share for lang, share in shares.items()}
    bottleneck = min(caps, key=caps.get)
    total = int(caps[bottleneck])

    untargeted = [s for lang, pool in buckets.items() if lang not in targets for s in pool]

    if total < len(samples) * MIN_BALANCE_RETENTION:
        have = {lang: len(pool) / len(samples) for lang, pool in buckets.items()}
        print(f"\n!! language balancing skipped: '{bottleneck}' is the bottleneck "
              f"({have.get(bottleneck, 0):.1%} of the corpus, target "
              f"{shares[bottleneck]:.0%}). Balancing would keep only "
              f"{total}/{len(samples)} examples.")
        print("   Fix the shortage at the source instead - generate more "
              f"{bottleneck} synthetic data, or relax language_targets.")
        return samples

    out: list[Sample] = []
    for lang, share in shares.items():
        keep = max(1, round(total * share)) if buckets.get(lang) else 0
        out.extend(buckets[lang][:keep])
    out.extend(untargeted)
    rng.shuffle(out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/data_mix.yaml")
    ap.add_argument("--tools", default=None, help="tool registry json")
    ap.add_argument("--out-dir", default="data/processed")
    ap.add_argument("--eval-size", type=int, default=500)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--only", nargs="*", help="build just these source names")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    registry = ToolRegistry.load(args.tools) if args.tools else ToolRegistry.load()
    rng = random.Random(args.seed)
    total = int(cfg["total_examples"])

    all_samples: list[Sample] = []
    print(f"target: {total} examples across {len(cfg['sources'])} sources\n")

    for spec in cfg["sources"]:
        if args.only and spec["name"] not in args.only:
            continue
        want = int(total * float(spec["weight"]))
        print(f"[{spec['name']}] want {want} via converter={spec['converter']}")
        try:
            got, report = collect_source(spec, want, registry)
        except Exception as exc:
            hint = ""
            if spec.get("gated"):
                hint = ("  (gated repo - accept the license on its HF page and "
                        "run `hf auth login`)")
            print(f"  !! skipped: {type(exc).__name__}: {exc}{hint}\n")
            continue
        print(f"  {report.render()}")
        if got and len(got) < want * 0.5:
            print(f"  !! only {len(got)}/{want} - check the converter against "
                  f"this dataset's current schema")
        print()
        all_samples.extend(got)

    if not all_samples:
        raise SystemExit(
            "no samples collected. Start with the seed set:\n"
            "  python -m flownote_agent.data.build_dataset --only flownote_synth"
        )

    before = Counter(s.lang for s in all_samples)
    all_samples = enforce_language_targets(all_samples, cfg.get("language_targets", {}), rng)
    after = Counter(s.lang for s in all_samples)

    rng.shuffle(all_samples)
    eval_n = min(args.eval_size, max(1, len(all_samples) // 10))
    eval_set, train_set = all_samples[:eval_n], all_samples[eval_n:]

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, subset in (("train", train_set), ("eval", eval_set)):
        path = out_dir / f"{name}.jsonl"
        with path.open("w", encoding="utf-8") as fh:
            for s in subset:
                fh.write(json.dumps(sample_to_row(s), ensure_ascii=False) + "\n")
        print(f"wrote {len(subset):>6} -> {path}")

    print("\nlanguage mix (before -> after balancing):")
    for lang in sorted(set(before) | set(after)):
        print(f"  {lang:<6} {before[lang]:>6} -> {after[lang]:>6}")
    print("\nsource mix:")
    for src, n in Counter(s.source for s in train_set).most_common():
        print(f"  {src:<18} {n:>6}  ({n / max(1, len(train_set)):.1%})")
    agentic = sum(1 for s in train_set if any(m.tool_calls for m in s.messages))
    print(f"\ntool-calling share: {agentic / max(1, len(train_set)):.1%} "
          f"(design target ~45%)")


if __name__ == "__main__":
    main()
