"""Verifies the loss mask against the REAL Gemma 4 tokenizer.

This is the highest-risk code in the repo: an off-by-one here does not crash, it
trains the model on the wrong tokens, and you find out after paying for a full
run. A stub tokenizer cannot test it honestly, because the state machine keys off
actual control-token ids and on how the official chat template lays a turn out.

Only tokenizer files are downloaded (a few MB), not the 5B checkpoint.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flownote_agent.data.converters import sample_to_row
from flownote_agent.protocol import (
    RESP_CLOSE,
    RESP_OPEN,
    TURN_CLOSE,
    Message,
    Sample,
    ToolCall,
    build_loss_mask,
    control_ids,
    render,
    stop_token_ids,
)
from flownote_agent.tools import ToolRegistry

MODEL = "google/gemma-4-E2B-it"


@pytest.fixture(scope="module")
def tok():
    transformers = pytest.importorskip("transformers")
    try:
        return transformers.AutoTokenizer.from_pretrained(MODEL)
    except Exception as exc:  # offline, or transformers too old
        pytest.skip(f"Gemma 4 tokenizer unavailable: {type(exc).__name__}: {exc}")


@pytest.fixture(scope="module")
def registry():
    return ToolRegistry.load()


def two_round_sample(registry) -> Sample:
    return Sample(
        tools=registry.specs(["search_notes", "update_note"]),
        messages=[
            Message(role="user", content="배포 회의록 찾아서 메모 추가해줘"),
            Message(role="assistant", thought="먼저 검색한다.",
                    tool_calls=[ToolCall("search_notes", {"query": "배포"})]),
            Message(role="tool", name="search_notes",
                    result={"count": 1, "note_id": "note_a13f9c"}),
            Message(role="assistant", thought="id를 얻었다. append로 추가.",
                    tool_calls=[ToolCall("update_note", {"note_id": "note_a13f9c",
                                                         "body": "- 메모", "mode": "append"})]),
            Message(role="tool", name="update_note", result={"status": "updated"}),
            Message(role="assistant", thought="완료.", content="메모를 추가했습니다."),
        ],
    )


def split_by_mask(sample, tok):
    text = render(sample, tok)
    ids = tok(text, add_special_tokens=False)["input_ids"]
    labels = build_loss_mask(ids, tok)
    keep = tok.decode([i for i, l in zip(ids, labels) if l != -100])
    drop = tok.decode([i for i, l in zip(ids, labels) if l == -100])
    return ids, labels, keep, drop


# --------------------------------------------------------------------------- #
# control tokens
# --------------------------------------------------------------------------- #

def test_every_control_token_is_a_single_token(tok):
    """The premise the whole design rests on: nothing is added to the tokenizer,
    so the 262k embedding matrix is never resized."""
    ids = control_ids(tok)
    assert len(ids) == 12
    for token, tid in ids.items():
        assert tok(token, add_special_tokens=False)["input_ids"] == [tid], token


def test_stop_ids_include_the_handoff_point(tok):
    stops = stop_token_ids(tok)
    ids = control_ids(tok)
    assert ids[TURN_CLOSE] in stops
    # Missing this one is the classic failure: the model sails past the handoff
    # and writes the tool's answer itself.
    assert ids[RESP_OPEN] in stops


# --------------------------------------------------------------------------- #
# the mask
# --------------------------------------------------------------------------- #

def test_mask_covers_model_output_and_nothing_else(tok, registry):
    sample = two_round_sample(registry)
    _, _, keep, drop = split_by_mask(sample, tok)

    # in: both thoughts, both calls, the final answer
    assert "먼저 검색한다." in keep
    assert "search_notes" in keep
    assert "update_note" in keep
    assert "메모를 추가했습니다." in keep

    # out: prompt side
    assert "배포 회의록 찾아서 메모 추가해줘" not in keep
    assert "FlowNote" not in keep                 # system prompt
    assert "declaration:" not in keep             # tool schemas
    assert "<|turn>" not in keep                  # turn headers


def test_tool_response_payload_is_never_supervised(tok, registry):
    """The single most important line in this file. Supervising the environment's
    answer teaches the model to invent tool output and then answer its own
    fiction."""
    _, _, keep, drop = split_by_mask(two_round_sample(registry), tok)
    assert "note_a13f9c" not in keep or "update_note" in keep  # id may appear in the call
    assert "response:search_notes" not in keep
    assert "response:update_note" not in keep
    assert RESP_CLOSE not in keep
    assert "response:search_notes" in drop


def test_handoff_and_stop_tokens_are_supervised(tok, registry):
    """<|tool_response> and <turn|> are how the model yields control. Mask them
    out and it never learns to stop."""
    _, _, keep, _ = split_by_mask(two_round_sample(registry), tok)
    assert keep.count(RESP_OPEN) == 2      # one per tool round
    assert keep.rstrip().endswith(TURN_CLOSE)


def test_supervised_share_is_a_minority(tok, registry):
    ids, labels, _, _ = split_by_mask(two_round_sample(registry), tok)
    share = sum(1 for l in labels if l != -100) / len(labels)
    # Tool schemas dominate the prompt. Anything near 1.0 means the mask
    # collapsed and the system block is being trained on.
    assert 0.02 < share < 0.5


def test_labels_equal_input_ids_where_supervised(tok, registry):
    ids, labels, _, _ = split_by_mask(two_round_sample(registry), tok)
    assert len(labels) == len(ids)
    for label, token in zip(labels, ids):
        assert label in (-100, token)


def test_user_turns_are_masked_in_multi_turn_conversations(tok, registry):
    sample = Sample(tools=registry.specs(["get_current_time"]), messages=[
        Message(role="user", content="첫번째질문입니다"),
        Message(role="assistant", thought="t1", content="첫번째답변입니다"),
        Message(role="user", content="두번째질문입니다"),
        Message(role="assistant", thought="t2", content="두번째답변입니다"),
    ])
    _, _, keep, _ = split_by_mask(sample, tok)
    assert "첫번째답변입니다" in keep
    assert "두번째답변입니다" in keep
    assert "첫번째질문입니다" not in keep
    assert "두번째질문입니다" not in keep


def test_no_tool_conversation_still_has_a_target(tok, registry):
    sample = Sample(tools=registry.specs(["search_notes"]), messages=[
        Message(role="user", content="QLoRA가 뭐야?"),
        Message(role="assistant", thought="일반 질문.", content="저랭크 어댑터입니다."),
    ])
    _, labels, keep, _ = split_by_mask(sample, tok)
    assert any(l != -100 for l in labels)
    assert "저랭크 어댑터입니다." in keep


def test_mask_rejects_a_non_gemma4_tokenizer():
    class NotGemma4:
        unk_token_id = 3

        def convert_tokens_to_ids(self, token):
            return 3

    with pytest.raises(ValueError, match="Gemma 4"):
        build_loss_mask([1, 2, 3], NotGemma4())


# --------------------------------------------------------------------------- #
# dataset + collator
# --------------------------------------------------------------------------- #

def write_jsonl(tmp_path: Path, samples: list[Sample]) -> Path:
    path = tmp_path / "data.jsonl"
    with path.open("w", encoding="utf-8") as fh:
        for s in samples:
            fh.write(json.dumps(sample_to_row(s), ensure_ascii=False) + "\n")
    return path


def test_dataset_builds_and_reports_stats(tmp_path, tok, registry):
    from flownote_agent.train.sft import AgentSFTDataset

    path = write_jsonl(tmp_path, [two_round_sample(registry)] * 3)
    ds = AgentSFTDataset(path, tok, max_seq_len=4096)
    assert len(ds) == 3
    assert ds.stats["total"] == 3
    assert ds.stats["overlong"] == 0


def test_overlong_examples_are_dropped_not_truncated(tmp_path, tok, registry):
    from flownote_agent.train.sft import AgentSFTDataset

    path = write_jsonl(tmp_path, [two_round_sample(registry)])
    with pytest.raises(SystemExit) as exc:
        AgentSFTDataset(path, tok, max_seq_len=50, drop_overlong=True)
    assert "'overlong': 1" in str(exc.value)


def test_truncation_that_removes_every_model_turn_drops_the_example(tmp_path, tok, registry):
    """Truncation is not a rescue: the system block and tool schemas come first,
    so a tight cut leaves nothing to learn from."""
    from flownote_agent.train.sft import AgentSFTDataset

    path = write_jsonl(tmp_path, [two_round_sample(registry)])
    with pytest.raises(SystemExit) as exc:
        AgentSFTDataset(path, tok, max_seq_len=50, drop_overlong=False)
    assert "'no_target': 1" in str(exc.value)


def test_collator_emits_the_multimodal_token_type_tensors():
    """Gemma 4's forward pass errors out without mm_token_type_ids, even for a
    pure-text batch."""
    from flownote_agent.train.sft import Gemma4Collator

    batch = Gemma4Collator(pad_token_id=0)([
        {"input_ids": [1, 2, 3], "labels": [-100, 2, 3]},
        {"input_ids": [4, 5], "labels": [-100, 5]},
    ])
    assert set(batch) == {"input_ids", "labels", "attention_mask",
                          "token_type_ids", "mm_token_type_ids"}
    assert batch["mm_token_type_ids"].tolist() == [[0, 0, 0], [0, 0, 0]]
    assert batch["token_type_ids"].shape == batch["input_ids"].shape
    assert batch["input_ids"].tolist() == [[1, 2, 3], [4, 5, 0]]
    assert batch["attention_mask"].tolist() == [[1, 1, 1], [1, 1, 0]]


def test_padding_is_never_supervised():
    """Padding labels must be -100, not pad_token_id - otherwise the model is
    trained to emit padding, which shows up as trailing garbage at inference."""
    from flownote_agent.train.sft import Gemma4Collator

    batch = Gemma4Collator(pad_token_id=0)([
        {"input_ids": [1, 2, 3, 4], "labels": [1, 2, 3, 4]},
        {"input_ids": [9], "labels": [9]},
    ])
    for label, attend in zip(batch["labels"][1].tolist(), batch["attention_mask"][1].tolist()):
        if attend == 0:
            assert label == -100
