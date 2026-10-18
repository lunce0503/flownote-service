"""Prepare an isolated 10-step training run using the checked-in seed set."""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flownote_agent.data.converters import from_internal  # noqa: E402
from flownote_agent.data.validate import check  # noqa: E402
from flownote_agent.tools import ToolRegistry  # noqa: E402


def prepare(seed_path: Path, config_path: Path, out_dir: Path,
            steps: int = 10) -> Path:
    if steps < 1:
        raise ValueError("steps must be positive")
    if out_dir.exists() and any(out_dir.iterdir()):
        raise ValueError(f"Refusing to overwrite {out_dir}; choose a new output directory.")
    rows = [json.loads(line) for line in seed_path.read_text(encoding="utf-8").splitlines()
            if line.strip()]
    if len(rows) < 3:
        raise ValueError("Need at least 3 seed conversations for separate train/eval sets")
    registry = ToolRegistry.load()
    for idx, row in enumerate(rows):
        sample = from_internal(row)
        problems = ["invalid sample"] if sample is None else check(
            sample, registry=registry, strict_tools=True)
        if problems:
            raise ValueError(f"seed row {idx + 1}: {problems}")

    random.Random(42).shuffle(rows)
    eval_n = min(2, len(rows) - 1)
    cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    out_dir = out_dir.resolve()
    cfg["lora"].update(r=8, alpha=16)
    cfg["data"].update(train_file=str(out_dir / "train.jsonl"),
                       eval_file=str(out_dir / "eval.jsonl"), max_seq_len=2048,
                       drop_overlong=True, train_on_model_turns_only=True)
    cfg["train"].update(
        output_dir=str(out_dir / "adapter"), max_steps=steps,
        per_device_train_batch_size=1, per_device_eval_batch_size=1,
        gradient_accumulation_steps=1, num_train_epochs=1,
        logging_steps=1, eval_strategy="steps", eval_steps=steps,
        save_strategy="steps", save_steps=steps, save_total_limit=1,
        report_to=[],
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, subset in (("train", rows[eval_n:]), ("eval", rows[:eval_n])):
        (out_dir / f"{name}.jsonl").write_text(
            "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in subset),
            encoding="utf-8",
        )
    config_out = out_dir / "train.yaml"
    config_out.write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False),
                          encoding="utf-8")
    print(f"Smoke only: {len(rows) - eval_n} train / {eval_n} eval / {steps} steps")
    print(f"Config: {config_out}")
    return config_out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-file", type=Path, default=ROOT / "data/seed/seed.jsonl")
    ap.add_argument("--config", type=Path, default=ROOT / "configs/train_qlora.yaml")
    ap.add_argument("--out-dir", type=Path, default=ROOT / "outputs/smoke")
    ap.add_argument("--steps", type=int, default=10)
    args = ap.parse_args()
    prepare(args.seed_file, args.config, args.out_dir, args.steps)


if __name__ == "__main__":
    main()
