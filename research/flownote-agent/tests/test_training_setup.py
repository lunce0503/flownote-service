"""Protect existing runs and keep evaluation conversations out of training."""
import json
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.prepare_smoke import prepare  # noqa: E402


def test_smoke_split_keeps_conversations_separate(tmp_path):
    config = prepare(ROOT / "data/seed/seed.jsonl",
                     ROOT / "configs/train_qlora.yaml", tmp_path / "run")
    cfg = yaml.safe_load(config.read_text())
    train = [json.loads(x) for x in Path(cfg["data"]["train_file"]).read_text().splitlines()]
    evaluation = [json.loads(x) for x in Path(cfg["data"]["eval_file"]).read_text().splitlines()]
    train_ids = {r["id"] for r in train}
    eval_ids = {r["id"] for r in evaluation}
    assert train_ids.isdisjoint(eval_ids)
    assert len(train) == 7 and len(evaluation) == 2
    assert len(train_ids | eval_ids) == 9
    assert cfg["train"]["max_steps"] == 10
    assert Path(cfg["train"]["output_dir"]).is_relative_to(tmp_path)


def test_existing_run_is_not_overwritten(tmp_path):
    sentinel = tmp_path / "adapter.safetensors"
    sentinel.write_bytes(b"existing model")
    with pytest.raises(ValueError, match="Refusing to overwrite"):
        prepare(ROOT / "data/seed/seed.jsonl", ROOT / "configs/train_qlora.yaml", tmp_path)
    assert sentinel.read_bytes() == b"existing model"
    assert not (tmp_path / "train.jsonl").exists()


def test_bad_seed_fails_before_output_is_created(tmp_path):
    seed = tmp_path / "bad.jsonl"
    seed.write_text('{"messages": []}\n' * 3)
    out = tmp_path / "run"
    with pytest.raises(ValueError, match="seed row"):
        prepare(seed, ROOT / "configs/train_qlora.yaml", out)
    assert not out.exists()
