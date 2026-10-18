"""Dataset balancing and the agent loop, driven by a scripted fake model.

No GPU and no checkpoint download - the loop only needs something that returns
text. Prompts still go through the real chat template, because "does the loop
build a prompt the model would actually accept" is most of what can go wrong.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flownote_agent.data.build_dataset import enforce_language_targets
from flownote_agent.protocol import (
    CHANNEL_CLOSE,
    CHANNEL_OPEN,
    RESP_OPEN,
    TURN_CLOSE,
    Message,
    Sample,
    ToolCall,
    format_tool_call,
)
from flownote_agent.runtime.agent_loop import AgentLoop, Budget
from flownote_agent.runtime.mock_tools import MOCK_EXECUTORS
from flownote_agent.tools import ToolRegistry

TARGETS = {"ko": 0.40, "en": 0.45, "mixed": 0.15}
MODEL = "google/gemma-4-E2B-it"


@pytest.fixture(scope="module")
def tok():
    transformers = pytest.importorskip("transformers")
    try:
        return transformers.AutoTokenizer.from_pretrained(MODEL)
    except Exception as exc:
        pytest.skip(f"Gemma 4 tokenizer unavailable: {type(exc).__name__}: {exc}")


def corpus(**counts: int) -> list[Sample]:
    out = []
    for lang, n in counts.items():
        for i in range(n):
            out.append(Sample(
                lang=lang, tools=[],
                messages=[Message(role="user", content=f"{lang}-{i}"),
                          Message(role="assistant", thought="t", content="a")],
            ))
    return out


# --------------------------------------------------------------------------- #
# language balancing
# --------------------------------------------------------------------------- #

def test_trims_over_represented_language():
    got = enforce_language_targets(corpus(ko=400, en=450, mixed=900), TARGETS,
                                   random.Random(0))
    counts = {lang: sum(1 for s in got if s.lang == lang) for lang in TARGETS}
    assert counts["mixed"] < 900
    for lang, share in TARGETS.items():
        assert counts[lang] / len(got) == pytest.approx(share, abs=0.02)


def test_scarce_language_does_not_zero_out_the_corpus():
    """Regression: flooring `total * share` used to return an empty list whenever
    one language was scarce, silently deleting the whole dataset."""
    got = enforce_language_targets(corpus(ko=6, en=1, mixed=2), TARGETS, random.Random(0))
    assert len(got) == 9


def test_refuses_to_discard_more_than_half(capsys):
    got = enforce_language_targets(corpus(ko=1000, en=10, mixed=1000), TARGETS,
                                   random.Random(0))
    assert len(got) == 2010
    assert "bottleneck" in capsys.readouterr().out


def test_no_targets_is_a_passthrough():
    data = corpus(ko=5, en=5)
    assert enforce_language_targets(data, {}, random.Random(0)) == data


def test_untargeted_languages_are_kept():
    got = enforce_language_targets(corpus(ko=400, en=450, mixed=150, ja=7),
                                   TARGETS, random.Random(0))
    assert sum(1 for s in got if s.lang == "ja") == 7


# --------------------------------------------------------------------------- #
# agent loop
# --------------------------------------------------------------------------- #

def thought(text: str) -> str:
    return f"{CHANNEL_OPEN}thought\n{text}\n{CHANNEL_CLOSE}"


def call_step(thought_text: str, *calls: ToolCall) -> str:
    return thought(thought_text) + "".join(format_tool_call(c) for c in calls) + RESP_OPEN


def answer_step(thought_text: str, text: str) -> str:
    return thought(thought_text) + text + TURN_CLOSE


class ScriptedLLM:
    """Returns canned steps in order and records every prompt it was given."""

    def __init__(self, steps: list[str]):
        self.steps = list(steps)
        self.prompts: list[str] = []

    def __call__(self, prompt: str, max_new_tokens: int = 512) -> str:
        self.prompts.append(prompt)
        return self.steps.pop(0) if self.steps else answer_step("done", "끝.")


def loop(tok, steps: list[str], **kw) -> tuple[AgentLoop, ScriptedLLM]:
    llm = ScriptedLLM(steps)
    return AgentLoop(llm=llm, registry=ToolRegistry.load(), executors=MOCK_EXECUTORS,
                     tokenizer=tok, verbose=False, **kw), llm


def test_single_call_then_answer(tok):
    agent, llm = loop(tok, [
        call_step("검색한다", ToolCall("search_notes", {"query": "standup"})),
        answer_step("찾았다", "1건 찾았습니다."),
    ])
    assert agent.run("standup 노트 찾아줘") == "1건 찾았습니다."
    # The second prompt continues the SAME model turn and carries the result.
    second = llm.prompts[1]
    assert second.count("<|turn>model") == 1
    assert "response:search_notes" in second
    assert second.endswith(f"{CHANNEL_OPEN}thought\n")


def test_invalid_arguments_come_back_as_a_tool_response(tok):
    """The trained self-correction path: a schema failure is an observation, not
    an exception."""
    agent, llm = loop(tok, [
        call_step("수정", ToolCall("update_note", {"note_id": "n1", "mode": "overwrite"})),
        call_step("고쳐서 재시도", ToolCall("update_note", {"note_id": "note_1",
                                                    "body": "x", "mode": "append"})),
        answer_step("완료", "수정했습니다."),
    ])
    assert agent.run("노트 고쳐줘") == "수정했습니다."
    assert "invalid_arguments" in llm.prompts[1]


def test_unknown_tool_is_reported_to_the_model(tok):
    agent, llm = loop(tok, [
        call_step("메일", ToolCall("send_email", {})),
        answer_step("없는 도구", "메일 전송은 지원하지 않습니다."),
    ])
    assert "지원하지 않습니다" in agent.run("메일 보내줘")
    assert "unknown tool" in llm.prompts[1]


def test_parallel_calls_produce_two_responses_in_one_turn(tok):
    agent, llm = loop(tok, [
        call_step("둘 다", ToolCall("list_tasks", {"status": "open"}),
                  ToolCall("get_current_time", {})),
        answer_step("정리", "할 일 없음."),
    ])
    agent.run("오늘 할 일과 시간")
    assert llm.prompts[1].count("<tool_response|>") == 2


def test_no_tool_needed_answers_immediately(tok):
    agent, llm = loop(tok, [answer_step("일반 질문", "QLoRA는 ...")])
    assert agent.run("QLoRA가 뭐야?") == "QLoRA는 ..."
    assert len(llm.prompts) == 1


def test_max_steps_stops_a_tool_call_loop(tok):
    spin = call_step("또", ToolCall("get_current_time", {}))
    agent, llm = loop(tok, [spin] * 10, max_steps=3)
    assert "중단" in agent.run("시간")
    assert len(llm.prompts) == 3


def test_only_the_requested_tool_subset_reaches_the_prompt(tok):
    agent, llm = loop(tok, [answer_step("t", "답.")])
    agent.run("?", tool_subset=["search_notes"])
    assert "declaration:search_notes" in llm.prompts[0]
    assert "declaration:delete_note" not in llm.prompts[0]


def test_prompt_ends_at_the_generation_point(tok):
    agent, llm = loop(tok, [answer_step("t", "답.")])
    agent.run("안녕")
    assert llm.prompts[0].endswith("<|turn>model\n")


# --------------------------------------------------------------------------- #
# context budgeting
# --------------------------------------------------------------------------- #

def rounds(n: int, payload: str) -> list[Message]:
    msgs: list[Message] = [Message(role="user", content="원래 요청")]
    for i in range(n):
        msgs.append(Message(role="assistant", thought=f"t{i}",
                            tool_calls=[ToolCall("get_current_time", {})]))
        msgs.append(Message(role="tool", name="get_current_time",
                            result={"now": payload, "i": i}))
    msgs.append(Message(role="assistant", thought="fin", content="끝"))
    return msgs


def test_bulky_old_tool_results_are_elided_before_rounds_are_dropped(tok):
    agent, _ = loop(tok, [], budget=Budget(total=1200, generation=200, system_reserve=100))
    messages = rounds(4, "가나다라마바사" * 100)
    assert agent._weight(messages) > agent.budget.history      # premise of the test

    trimmed = agent.trim_history(messages)
    assert agent._weight(trimmed) <= agent.budget.history

    assert trimmed[0].content == "원래 요청"
    assert len(trimmed) == len(messages), "eliding should have been enough on its own"
    elided = [m for m in trimmed if m.role == "tool"
              and isinstance(m.result, dict) and "elided" in m.result]
    assert elided, "large old payloads should be stubbed before rounds are dropped"


def test_a_conversation_already_under_budget_is_left_alone(tok):
    agent, _ = loop(tok, [], budget=Budget(total=1200, generation=200, system_reserve=100))
    messages = rounds(4, "가나다라마바사" * 40)
    assert agent._weight(messages) <= agent.budget.history
    assert agent.trim_history(messages) == messages


def test_trimming_never_orphans_a_tool_result(tok):
    """A tool result whose assistant message was dropped has nothing to attach
    to, and the chat template rejects the conversation outright. So trimming
    happens at round boundaries."""
    from flownote_agent.protocol import to_chat_messages

    agent, _ = loop(tok, [], budget=Budget(total=400, generation=100, system_reserve=100))
    trimmed = agent.trim_history(rounds(25, "x" * 500))
    assert len(trimmed) < 51
    to_chat_messages(Sample(messages=trimmed, tools=[]))  # must not raise
    assert trimmed[0].content == "원래 요청"
    assert trimmed[-1].content == "끝"


def test_short_conversations_are_untouched(tok):
    agent, _ = loop(tok, [], budget=Budget(total=200, generation=50, system_reserve=50))
    messages = [Message(role="user", content="q"),
                Message(role="assistant", thought="t", content="a")]
    assert agent.trim_history(messages) == messages
