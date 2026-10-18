PY ?= python
export PYTHONPATH := src:$(PYTHONPATH)

.PHONY: help venv test seed tokenizer synth data dry train eval eval-base chat gguf clean gpu-setup smoke

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

venv:            ## create .venv and install deps
	python3 -m venv .venv
	.venv/bin/pip install -U pip
	.venv/bin/pip install -r requirements.txt

test:            ## run the protocol/converter tests (no GPU, no model download)
	$(PY) -m pytest tests -q

gpu-setup:       ## create the CUDA training environment on a RunPod GPU Pod
	bash scripts/runpod_bootstrap.sh

smoke:           ## run 10 training steps and reload the saved adapter (GPU)
	PYTHON="$(PY)" bash scripts/run_training_smoke.sh

seed:            ## build + validate the hand-written seed set
	$(PY) scripts/make_seed.py

tokenizer:       ## measure control-tag and Korean token costs (downloads tokenizer only)
	$(PY) scripts/check_tokenizer.py

synth:           ## generate FlowNote-specific agent data with the teacher model
	$(PY) -m flownote_agent.data.synth --n 2000 --out data/processed/synth.jsonl

data:            ## build the full SFT mix from configs/data_mix.yaml
	$(PY) -m flownote_agent.data.build_dataset

dry:             ## tokenize + report length stats, no training
	$(PY) -m flownote_agent.train.sft --dry-run

train:           ## QLoRA SFT
	$(PY) -m flownote_agent.train.sft

eval:            ## score tool-calling against the eval split
	$(PY) -m flownote_agent.eval.tool_eval --adapter outputs/flownote-e2b-qlora/final

eval-base:       ## same metrics on the un-tuned base model, for comparison
	$(PY) -m flownote_agent.eval.tool_eval

chat:            ## interactive agent loop with mock FlowNote tools
	$(PY) -m flownote_agent.runtime.agent_loop --adapter outputs/flownote-e2b-qlora/final

gguf:            ## merge adapter and export quantized GGUF
	bash scripts/export_gguf.sh

clean:           ## remove generated data and checkpoints (keeps data/seed)
	rm -rf data/processed/* data/raw/* outputs/ .pytest_cache
