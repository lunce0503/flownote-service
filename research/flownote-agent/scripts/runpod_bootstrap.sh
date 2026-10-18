#!/usr/bin/env bash
# Bootstrap a single-GPU training environment on a RunPod PyTorch image.
# Keep the project and cache on the persistent /workspace volume.
set -euo pipefail

TRAIN_PROJECT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TRAIN_WORKSPACE="${WORKSPACE:-/workspace}"
TRAIN_VENV="${TRAIN_VENV:-$TRAIN_PROJECT/.venv-gpu}"
TRAIN_BOOTSTRAP_PYTHON="${BOOTSTRAP_PYTHON:-python3}"
TRAIN_ENV_FILE="$TRAIN_PROJECT/outputs/training-env.sh"

# Check the image before pip installs anything or weights are downloaded.
"$TRAIN_BOOTSTRAP_PYTHON" - "$TRAIN_WORKSPACE" <<'PY'
import shutil
import sys
from pathlib import Path
import torch
from packaging.version import Version

if Version(torch.__version__.split("+")[0]) < Version("2.7"):
    sys.exit("Use a PyTorch 2.7+ GPU image.")
if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
    sys.exit("CUDA with BF16 support is required. Select a GPU PyTorch image.")
workspace = Path(sys.argv[1])
if not workspace.is_dir():
    sys.exit(f"Persistent workspace missing: {workspace}")
free = shutil.disk_usage(workspace).free / 1024**3
if free < 30:
    sys.exit(f"Need at least 30 GiB free before installation; available {free:.1f}.")
print(f"GPU: {torch.cuda.get_device_name(0)}; torch: {torch.__version__}; free: {free:.1f} GiB")
PY

mkdir -p "$TRAIN_PROJECT/outputs/environment" "$TRAIN_WORKSPACE/hf_cache"
if [ ! -x "$TRAIN_VENV/bin/python" ]; then
    "$TRAIN_BOOTSTRAP_PYTHON" -m venv --system-site-packages "$TRAIN_VENV"
fi

# Reuse the image's CUDA wheels and constrain the resolver to those exact builds.
"$TRAIN_BOOTSTRAP_PYTHON" - "$TRAIN_PROJECT/outputs/environment/cuda-constraints.txt" <<'PY'
import importlib.metadata as m
import sys
from pathlib import Path
lines = []
for name in ("torch", "torchvision", "torchaudio"):
    try:
        lines.append(f"{name}=={m.version(name)}")
    except m.PackageNotFoundError:
        pass
Path(sys.argv[1]).write_text("\n".join(lines) + "\n")
PY
"$TRAIN_VENV/bin/python" -m pip install \
    -c "$TRAIN_PROJECT/outputs/environment/cuda-constraints.txt" \
    -r "$TRAIN_PROJECT/requirements-train.txt"

# Write a sourceable file, using shell quoting for paths containing spaces.
# Do not edit .bashrc or persist access tokens.
{
    printf 'export VIRTUAL_ENV=%q\n' "$TRAIN_VENV"
    printf 'export PATH=%q:"$PATH"\n' "$TRAIN_VENV/bin"
    printf 'export PYTHONPATH=%q:"${PYTHONPATH:-}"\n' "$TRAIN_PROJECT/src"
    printf 'export HF_HOME=%q\n' "$TRAIN_WORKSPACE/hf_cache"
    printf 'export WORKSPACE=%q\n' "$TRAIN_WORKSPACE"
    printf 'export TOKENIZERS_PARALLELISM=false\n'
} > "$TRAIN_ENV_FILE"
source "$TRAIN_ENV_FILE"
cd "$TRAIN_PROJECT"
python scripts/check_training_env.py --workspace "$TRAIN_WORKSPACE" \
    --out outputs/environment/preflight.json
python -m pip freeze > outputs/environment/requirements-freeze.txt
python scripts/check_tokenizer.py
python -m pytest tests -q

echo
echo "Training environment ready. No model weights downloaded or training started."
printf 'Run: source %q\n' "$TRAIN_ENV_FILE"
echo "Then: make smoke"
echo "Use tmux before starting GPU training so SSH disconnection does not interrupt it."
