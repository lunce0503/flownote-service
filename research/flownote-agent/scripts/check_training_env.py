"""Check the CUDA training environment without downloading model weights."""

from __future__ import annotations

import argparse
import importlib
import json
import platform
import shutil
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", default="/workspace")
    ap.add_argument("--min-free-gb", type=float, default=30)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    import torch

    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU unavailable. Use a GPU Pod with CUDA-enabled PyTorch.")
    if not torch.cuda.is_bf16_supported():
        raise SystemExit("This training config requires a GPU with BF16 support.")

    workspace = Path(args.workspace)
    if not workspace.is_dir():
        raise SystemExit(f"Workspace does not exist: {workspace}")
    free_gb = shutil.disk_usage(workspace).free / 1024**3
    if free_gb < args.min_free_gb:
        raise SystemExit(f"Only {free_gb:.1f} GiB free at {workspace}; "
                         f"need at least {args.min_free_gb:g} GiB.")

    versions = {"torch": torch.__version__}
    for name in ("transformers", "peft", "accelerate", "bitsandbytes", "timm"):
        module = importlib.import_module(name)
        versions[name] = module.__version__

    from transformers import AutoModelForImageTextToText  # noqa: F401
    from transformers.models.auto.configuration_auto import CONFIG_MAPPING_NAMES
    if "gemma4" not in CONFIG_MAPPING_NAMES:
        raise SystemExit("Installed transformers does not support gemma4.")

    # Exercise actual CUDA NF4 kernels and backward before a multi-GB download.
    import bitsandbytes as bnb
    layer = bnb.nn.Linear4bit(64, 64, bias=False, compute_dtype=torch.bfloat16,
                             quant_type="nf4").to("cuda")
    x = torch.randn(2, 64, device="cuda", dtype=torch.bfloat16, requires_grad=True)
    y = layer(x)
    y.float().square().mean().backward()
    torch.cuda.synchronize()
    if not torch.isfinite(y).all() or x.grad is None or not torch.isfinite(x.grad).all():
        raise SystemExit("NF4 forward/backward produced non-finite values or no gradient.")

    gpu = torch.cuda.get_device_properties(0)
    report = {
        "python": platform.python_version(), "versions": versions,
        "cuda": torch.version.cuda, "gpu": gpu.name,
        "vram_gib": round(gpu.total_memory / 1024**3, 2),
        "workspace": str(workspace.resolve()), "free_gib": round(free_gb, 2),
        "nf4_forward_backward": "passed",
    }
    print(json.dumps(report, indent=2))
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
