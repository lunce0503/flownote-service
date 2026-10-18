"""QLoRA SFT for the FlowNote agent on Gemma 4 E2B.

    python -m flownote_agent.train.sft --config configs/train_qlora.yaml

Uses plain `transformers.Trainer` rather than TRL's SFTTrainer, because the loss
mask is a token-level state machine over Gemma 4's control tokens (see
protocol.build_loss_mask) and cannot be expressed as a response-template match.

Three Gemma 4 specifics are handled here that are not obvious from the model card:

  1. ``mm_token_type_ids`` (and ``token_type_ids``) must be in every batch, even
     for pure text. The forward pass validates their presence and errors out
     without them. They are all-zeros for text-only. This also forces
     ``remove_unused_columns=False``, or Trainer strips them again.

  2. LoRA targets are resolved by enumerating real module names and scoping to
     the text decoder. Gemma 4's vision and audio towers use the same leaf names
     (``q_proj``, ``gate_proj``, ...) but wrap them in ``Gemma4ClippableLinear``,
     which PEFT rejects outright - passing bare suffixes fails with
     "Target module Gemma4ClippableLinear is not supported". Scoping avoids the
     towers entirely, so no monkey-patching is needed.

  3. ``use_cache`` is left ON by default for E2B/E4B. These variants share KV
     across layers, and the usual "turn the cache off during training" advice is
     reported to produce gibberish here. See the config comment - this one is
     worth verifying on your own run.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import yaml
from torch.utils.data import Dataset

from ..data.converters import from_internal
from ..protocol import build_loss_mask, control_ids, render

import json


# --------------------------------------------------------------------------- #
# dataset
# --------------------------------------------------------------------------- #

class AgentSFTDataset(Dataset):
    """Pre-tokenizes on construction so length problems surface before the GPU
    is billed for an epoch."""

    def __init__(self, path: str | Path, tokenizer, max_seq_len: int,
                 drop_overlong: bool = True, train_on_model_turns_only: bool = True):
        self.examples: list[dict[str, Any]] = []
        self.stats = {"total": 0, "overlong": 0, "no_target": 0,
                      "unparseable": 0, "render_failed": 0}
        control_ids(tokenizer)   # fail loudly now if this is not a Gemma 4 tokenizer

        with Path(path).open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                self.stats["total"] += 1
                sample = from_internal(json.loads(line))
                if sample is None:
                    self.stats["unparseable"] += 1
                    continue
                try:
                    text = render(sample, tokenizer)
                except Exception:  # noqa: BLE001 - one bad row must not kill the run
                    self.stats["render_failed"] += 1
                    continue

                ids = tokenizer(text, add_special_tokens=False)["input_ids"]

                if len(ids) > max_seq_len:
                    self.stats["overlong"] += 1
                    if drop_overlong:
                        # Cutting mid-call teaches unterminated tool calls.
                        continue
                    ids = ids[:max_seq_len]

                labels = (build_loss_mask(ids, tokenizer)
                          if train_on_model_turns_only else list(ids))

                if all(label == -100 for label in labels):
                    self.stats["no_target"] += 1
                    continue

                self.examples.append({"input_ids": ids, "labels": labels})

        if not self.examples:
            raise SystemExit(f"{path} produced 0 usable examples: {self.stats}")

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> dict[str, Any]:
        return self.examples[idx]


@dataclass
class Gemma4Collator:
    """Pads, and emits the multimodal token-type tensors Gemma 4 requires.

    ``mm_token_type_ids`` marks which positions are image/audio/video rather than
    text. A text-only batch is all zeros - but the tensor still has to be there,
    or the forward pass raises "`mm_token_type_ids` is required as a model input
    when training".
    """
    pad_token_id: int

    def __call__(self, features: list[dict[str, Any]]) -> dict[str, torch.Tensor]:
        width = max(len(f["input_ids"]) for f in features)
        batch: dict[str, list[list[int]]] = {
            "input_ids": [], "labels": [], "attention_mask": [],
            "token_type_ids": [], "mm_token_type_ids": [],
        }
        for f in features:
            pad = width - len(f["input_ids"])
            batch["input_ids"].append(f["input_ids"] + [self.pad_token_id] * pad)
            # Padding is -100, never pad_token_id: training the model to emit
            # padding shows up as trailing garbage at inference.
            batch["labels"].append(f["labels"] + [-100] * pad)
            batch["attention_mask"].append([1] * len(f["input_ids"]) + [0] * pad)
            batch["token_type_ids"].append([0] * width)
            batch["mm_token_type_ids"].append([0] * width)
        return {k: torch.tensor(v, dtype=torch.long) for k, v in batch.items()}


# --------------------------------------------------------------------------- #
# model
# --------------------------------------------------------------------------- #

def load_base_model(cfg: dict[str, Any]):
    from transformers import AutoModelForImageTextToText, BitsAndBytesConfig

    mcfg, qcfg = cfg["model"], cfg["quantization"]
    dtype = getattr(torch, mcfg.get("dtype", "bfloat16"))

    quant = None
    if qcfg.get("load_in_4bit"):
        quant = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type=qcfg.get("bnb_4bit_quant_type", "nf4"),
            bnb_4bit_use_double_quant=qcfg.get("bnb_4bit_use_double_quant", True),
            bnb_4bit_compute_dtype=getattr(torch, qcfg.get("bnb_4bit_compute_dtype", "bfloat16")),
        )

    model = AutoModelForImageTextToText.from_pretrained(
        mcfg["base_id"],
        dtype=dtype,
        quantization_config=quant,
        device_map={"": 0} if torch.cuda.is_available() else "cpu",
    )
    print(f"loaded {mcfg['base_id']} as {type(model).__name__}")
    return model


def resolve_lora_targets(model, suffixes: list[str], scope_contains: str | None) -> list[str]:
    """Enumerate real module names rather than trusting suffix matching.

    Gemma 4 carries a vision tower and an audio tower whose projections share the
    same leaf names as the text decoder but are ``Gemma4ClippableLinear``, a type
    PEFT refuses. Passing bare suffixes fails the whole run; scoping to
    ``language_model`` yields 205 clean targets on E2B.

    Note the count is asymmetric on purpose: E2B shares KV across layers, so
    there are 35 q_proj/o_proj but only 15 k_proj/v_proj. Enumeration gets that
    right; a hand-written list would not.
    """
    linear_types = {"Linear", "Linear4bit", "Linear8bitLt"}
    matched, skipped = [], []
    for name, module in model.named_modules():
        if module.__class__.__name__ not in linear_types:
            continue
        if not any(name.endswith(s) for s in suffixes):
            continue
        if scope_contains and scope_contains not in name:
            skipped.append(name)
            continue
        matched.append(name)

    if not matched:
        raise SystemExit(
            f"no module matched suffixes={suffixes} scope={scope_contains!r}. "
            "Check model.base_id and lora.scope_contains."
        )

    buckets: dict[str, int] = {}
    for name in matched:
        leaf = name.rsplit(".", 1)[-1]
        buckets[leaf] = buckets.get(leaf, 0) + 1
    print(f"LoRA targets: {len(matched)} modules {buckets}")
    if skipped:
        towers = sorted({n.split(".")[1] for n in skipped if "." in n})
        print(f"  excluded {len(skipped)} modules outside the text decoder "
              f"({', '.join(towers)}) - these are Gemma4ClippableLinear and "
              f"would make PEFT raise")
    return matched


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/train_qlora.yaml")
    ap.add_argument("--resume", default=None, help="checkpoint dir to resume from")
    ap.add_argument("--dry-run", action="store_true",
                    help="tokenize the dataset, show the mask, then exit")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text(encoding="utf-8"))
    dcfg, tcfg, lcfg = cfg["data"], cfg["train"], cfg["lora"]

    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(cfg["model"]["base_id"])
    if tok.pad_token_id is None:
        tok.pad_token = tok.eos_token

    print("tokenizing train set...")
    train_ds = AgentSFTDataset(
        dcfg["train_file"], tok, dcfg["max_seq_len"],
        dcfg.get("drop_overlong", True), dcfg.get("train_on_model_turns_only", True),
    )
    print(f"  {len(train_ds)} usable / {train_ds.stats}")

    eval_ds = None
    if dcfg.get("eval_file") and Path(dcfg["eval_file"]).exists():
        eval_ds = AgentSFTDataset(
            dcfg["eval_file"], tok, dcfg["max_seq_len"],
            dcfg.get("drop_overlong", True), dcfg.get("train_on_model_turns_only", True),
        )
        print(f"  eval: {len(eval_ds)} usable / {eval_ds.stats}")

    lengths = sorted(len(e["input_ids"]) for e in train_ds.examples)
    supervised = [sum(1 for l in e["labels"] if l != -100) for e in train_ds.examples]
    print(f"  seq len  p50={lengths[len(lengths)//2]}  "
          f"p95={lengths[int(len(lengths)*0.95)]}  max={lengths[-1]}")
    print(f"  supervised tokens: {sum(supervised)/max(1,len(supervised)):.0f} avg "
          f"({sum(supervised)/max(1,sum(lengths)):.1%} of all tokens)")

    if args.dry_run:
        ex = train_ds.examples[0]
        keep = [i for i, l in zip(ex["input_ids"], ex["labels"]) if l != -100]
        drop = [i for i, l in zip(ex["input_ids"], ex["labels"]) if l == -100]
        print("\n--- SUPERVISED (what the model is trained to produce) ---")
        print(tok.decode(keep))
        print("\n--- MASKED, first 300 chars (prompt + environment) ---")
        print(tok.decode(drop)[:300])
        print("\nIf any user text appears in the supervised block, the mask is broken.")
        return

    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import Trainer, TrainingArguments

    model = load_base_model(cfg)

    # E2B/E4B share KV across layers; disabling the cache during training is
    # reported to corrupt that path and produce gibberish. This contradicts the
    # usual pairing with gradient checkpointing, so it is a config knob, not a
    # constant - if your loss looks fine but generations are garbage, flip it.
    model.config.use_cache = bool(tcfg.get("use_cache", True))

    if cfg["quantization"].get("load_in_4bit"):
        model = prepare_model_for_kbit_training(
            model,
            use_gradient_checkpointing=tcfg.get("gradient_checkpointing", True),
            gradient_checkpointing_kwargs={"use_reentrant": False},
        )
        model.config.use_cache = bool(tcfg.get("use_cache", True))

    targets = resolve_lora_targets(model, lcfg["target_suffixes"], lcfg.get("scope_contains"))
    model = get_peft_model(model, LoraConfig(
        r=lcfg["r"],
        lora_alpha=lcfg["alpha"],
        lora_dropout=lcfg["dropout"],
        bias=lcfg.get("bias", "none"),
        task_type="CAUSAL_LM",
        target_modules=targets,
        modules_to_save=lcfg.get("modules_to_save") or None,
    ))
    model.print_trainable_parameters()

    out_dir = Path(tcfg["output_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    tok.save_pretrained(out_dir)

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(out_dir),
            num_train_epochs=tcfg["num_train_epochs"],
            max_steps=tcfg.get("max_steps", -1),
            per_device_train_batch_size=tcfg["per_device_train_batch_size"],
            per_device_eval_batch_size=tcfg.get("per_device_eval_batch_size", 1),
            gradient_accumulation_steps=tcfg["gradient_accumulation_steps"],
            learning_rate=float(tcfg["learning_rate"]),
            lr_scheduler_type=tcfg["lr_scheduler_type"],
            warmup_ratio=tcfg["warmup_ratio"],
            weight_decay=tcfg["weight_decay"],
            max_grad_norm=tcfg["max_grad_norm"],
            optim=tcfg["optim"],
            gradient_checkpointing=tcfg.get("gradient_checkpointing", True),
            gradient_checkpointing_kwargs={"use_reentrant": False},
            bf16=tcfg.get("bf16", True),
            logging_steps=tcfg["logging_steps"],
            eval_strategy=tcfg["eval_strategy"] if eval_ds is not None else "no",
            eval_steps=tcfg["eval_steps"],
            save_strategy=tcfg["save_strategy"],
            save_steps=tcfg["save_steps"],
            save_total_limit=tcfg["save_total_limit"],
            seed=tcfg["seed"],
            report_to=tcfg.get("report_to") or [],
            # Required: Trainer would otherwise drop mm_token_type_ids.
            remove_unused_columns=False,
            label_names=["labels"],
        ),
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=Gemma4Collator(pad_token_id=tok.pad_token_id),
    )

    trainer.train(resume_from_checkpoint=args.resume)
    trainer.save_model(str(out_dir / "final"))
    tok.save_pretrained(out_dir / "final")
    print(f"\nadapter saved to {out_dir / 'final'}")
    print("Loss around 13-15 is normal for E2B/E4B (multimodal head); "
          "values in the hundreds mean gradient accumulation is misconfigured.")


if __name__ == "__main__":
    main()
