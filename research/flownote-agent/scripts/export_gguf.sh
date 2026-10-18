#!/usr/bin/env bash
# Merge the LoRA adapter into the base model, then convert to GGUF for local use.
#
#   bash scripts/export_gguf.sh outputs/flownote-e2b-qlora/final
#
# Do this on the pod, before you tear it down: merging needs the full bf16 model
# in RAM (~11GB for E2B), and downloading a ~3GB Q4 GGUF beats downloading the
# full safetensors set.
#
# A caveat worth knowing: an adapter trained on the 4-bit quantized base and then
# merged into the bf16 base is a small approximation - the adapter learned to
# correct nf4-quantized weights. It is what everyone does, but if tool-call
# accuracy drops after export, that gap is the first thing to suspect. Re-run
# eval on the merged model, not just the adapter.

set -euo pipefail

ADAPTER="${1:-outputs/flownote-e2b-qlora/final}"
BASE="${BASE:-google/gemma-4-E2B-it}"
MERGED="${MERGED:-outputs/flownote-e2b-merged}"
QUANTS="${QUANTS:-Q4_K_M Q8_0}"
LLAMA_CPP="${LLAMA_CPP:-$HOME/llama.cpp}"

echo "==> merging $ADAPTER into $BASE"
python - "$BASE" "$ADAPTER" "$MERGED" <<'PY'
import sys
import torch
from peft import PeftModel
from transformers import AutoModelForImageTextToText, AutoTokenizer

base, adapter, out = sys.argv[1:4]

model = AutoModelForImageTextToText.from_pretrained(base, dtype=torch.bfloat16,
                                                    device_map="cpu")
print(f"  loaded {type(model).__name__}")
model = PeftModel.from_pretrained(model, adapter)
model = model.merge_and_unload()
model.save_pretrained(out, safe_serialization=True)
AutoTokenizer.from_pretrained(adapter).save_pretrained(out)
print(f"  merged -> {out}")
PY

if [ ! -d "$LLAMA_CPP" ]; then
  echo "==> cloning llama.cpp into $LLAMA_CPP"
  git clone --depth 1 https://github.com/ggml-org/llama.cpp "$LLAMA_CPP"
  pip install --no-cache-dir -r "$LLAMA_CPP/requirements.txt"
fi

echo "==> converting to f16 GGUF"
python "$LLAMA_CPP/convert_hf_to_gguf.py" "$MERGED" \
  --outfile "$MERGED/flownote-e2b-f16.gguf" --outtype f16

if [ ! -x "$LLAMA_CPP/build/bin/llama-quantize" ]; then
  echo "==> building llama-quantize"
  cmake -S "$LLAMA_CPP" -B "$LLAMA_CPP/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
  cmake --build "$LLAMA_CPP/build" --target llama-quantize -j"$(nproc)" >/dev/null
fi

for q in $QUANTS; do
  echo "==> quantizing $q"
  "$LLAMA_CPP/build/bin/llama-quantize" \
    "$MERGED/flownote-e2b-f16.gguf" \
    "$MERGED/flownote-e2b-${q}.gguf" "$q"
done

ls -lh "$MERGED"/*.gguf

cat <<'EOF'

==> done. Two stop strings are required, not one:

  <turn|>            the model finished its turn
  <|tool_response>   the model is handing control to your tool runner

Miss the second one and the model sails past the handoff, writes the tool's
answer itself, and then answers its own fiction. That is the single most common
way a working fine-tune looks broken after export.

  llama-cli -m outputs/flownote-e2b-merged/flownote-e2b-Q4_K_M.gguf -c 8192 \
    --reverse-prompt '<turn|>' --reverse-prompt '<|tool_response>'

  # Ollama
  cat > Modelfile <<'MODELFILE'
FROM ./flownote-e2b-Q4_K_M.gguf
PARAMETER stop "<turn|>"
PARAMETER stop "<|tool_response>"
PARAMETER temperature 1.0
PARAMETER top_p 0.95
PARAMETER top_k 64
MODELFILE
  ollama create flownote -f Modelfile

Sampling above is Gemma 4's own recommendation (temperature 1.0 / top_p 0.95 /
top_k 64) - it is not the usual "turn temperature down for structured output",
so do not swap in temperature 0 out of habit.
EOF
