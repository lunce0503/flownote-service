#!/usr/bin/env bash
# Run after sourcing the environment printed by runpod_bootstrap.sh.
set -euo pipefail
SMOKE_PROJECT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SMOKE_PROJECT"
export PYTHONPATH="$SMOKE_PROJECT/src:${PYTHONPATH:-}"
SMOKE_PYTHON="${PYTHON:-python}"
SMOKE_DIR="${SMOKE_DIR:-$SMOKE_PROJECT/outputs/smoke-$(date -u +%Y%m%dT%H%M%SZ)}"
SMOKE_WORKSPACE="${WORKSPACE:-/workspace}"

# Fail before downloading weights or preparing output on a CPU-only machine.
"$SMOKE_PYTHON" scripts/check_training_env.py --workspace "$SMOKE_WORKSPACE"
"$SMOKE_PYTHON" scripts/prepare_smoke.py --out-dir "$SMOKE_DIR" --steps "${SMOKE_STEPS:-10}"
exec > >(tee "$SMOKE_DIR/run.log") 2>&1
"$SMOKE_PYTHON" -m pip freeze > "$SMOKE_DIR/requirements-freeze.txt"
"$SMOKE_PYTHON" scripts/check_training_env.py --workspace "$SMOKE_WORKSPACE" \
    --out "$SMOKE_DIR/environment.json"
"$SMOKE_PYTHON" -m flownote_agent.train.sft --config "$SMOKE_DIR/train.yaml" --dry-run
"$SMOKE_PYTHON" -m flownote_agent.train.sft --config "$SMOKE_DIR/train.yaml"

# A fresh process must load the saved adapter and perform inference successfully.
SMOKE_BASE="$("$SMOKE_PYTHON" -c 'import sys,yaml; print(yaml.safe_load(open(sys.argv[1]))["model"]["base_id"])' "$SMOKE_DIR/train.yaml")"
"$SMOKE_PYTHON" -m flownote_agent.eval.tool_eval --base "$SMOKE_BASE" \
    --adapter "$SMOKE_DIR/adapter/final" --data "$SMOKE_DIR/eval.jsonl" \
    --limit 2 --max-new-tokens 128 --greedy --dump "$SMOKE_DIR/reload-eval.jsonl"
echo "Smoke completed: $SMOKE_DIR (environment check, not a model quality benchmark)"
