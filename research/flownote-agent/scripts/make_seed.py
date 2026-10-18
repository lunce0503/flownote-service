"""Build data/seed/seed.jsonl - the hand-written reference set.

    python scripts/make_seed.py

These examples are written in Python rather than raw JSONL on purpose: they get
validated against the real tool schemas as they are built, so a typo in an
argument name fails here instead of surfacing as a mystery at eval time.

They serve three jobs:
  - executable documentation of the wire format
  - a smoke-test corpus (the whole pipeline runs on these alone)
  - few-shot exemplars you can paste into the teacher prompt if the synthetic
    generator drifts off-format
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flownote_agent.data.converters import sample_to_row  # noqa: E402
from flownote_agent.data.validate import check  # noqa: E402
from flownote_agent.protocol import Message, Sample, ToolCall  # noqa: E402
from flownote_agent.tools import ToolRegistry  # noqa: E402

REG = ToolRegistry.load()


def S(id_: str, lang: str, tools: list[str], messages: list[Message]) -> Sample:
    return Sample(id=id_, lang=lang, source="seed",
                  tools=REG.specs(tools), messages=messages)


SEED: list[Sample] = [

    # --- single call, Korean ------------------------------------------------
    S("seed-single-ko", "ko", ["search_notes", "get_note", "create_note"], [
        Message(role="user", content="지난주에 쓴 회의록 중에 배포 얘기 나온 거 찾아줘."),
        Message(role="assistant",
                thought="노트 검색이 필요하다. '배포'를 키워드로 search_notes를 호출한다.",
                tool_calls=[ToolCall("search_notes", {"query": "배포 회의록", "limit": 5})]),
        Message(role="tool", name="search_notes", result={
            "count": 1,
            "results": [{"note_id": "note_a13f9c", "title": "주간 standup 2026-07-29",
                         "snippet": "- 배포 파이프라인 점검 - QLoRA 실험 결과 공유",
                         "updated_at": "2026-07-29T10:12:00+09:00"}],
        }),
        Message(role="assistant",
                thought="1건 찾았다. 제목과 요약을 알려주면 충분하다.",
                content="「주간 standup 2026-07-29」 노트에 배포 이야기가 있습니다. "
                        "배포 파이프라인 점검과 QLoRA 실험 결과 공유가 안건이었어요."),
    ]),

    # --- multi-step: result of one call feeds the next ----------------------
    S("seed-multistep-mixed", "mixed", ["search_notes", "update_note", "create_task"], [
        Message(role="user", content="어제 standup 노트에 action item 하나 추가해줘. "
                                     "'배포 스크립트 리뷰'로."),
        Message(role="assistant",
                thought="노트 id를 모른다. 먼저 standup 노트를 검색해서 id를 얻어야 한다.",
                tool_calls=[ToolCall("search_notes", {"query": "standup", "limit": 3})]),
        Message(role="tool", name="search_notes", result={
            "count": 1,
            "results": [{"note_id": "note_a13f9c", "title": "주간 standup 2026-07-29",
                         "snippet": "- 배포 파이프라인 점검",
                         "updated_at": "2026-07-29T10:12:00+09:00"}],
        }),
        Message(role="assistant",
                thought="id를 얻었다. 기존 내용을 지우지 않도록 mode=append로 추가한다.",
                tool_calls=[ToolCall("update_note", {
                    "note_id": "note_a13f9c",
                    "body": "- [ ] 배포 스크립트 리뷰",
                    "mode": "append",
                })]),
        Message(role="tool", name="update_note", result={
            "status": "updated", "note_id": "note_a13f9c",
            "updated_at": "2026-07-30T09:41:00+09:00"}),
        Message(role="assistant",
                thought="추가 완료. 어떤 노트에 무엇을 넣었는지 명시한다.",
                content="「주간 standup 2026-07-29」 노트 맨 아래에 "
                        "`- [ ] 배포 스크립트 리뷰`를 추가했습니다."),
    ]),

    # --- relative time must go through get_current_time ---------------------
    S("seed-reltime-ko", "ko", ["get_current_time", "set_reminder"], [
        Message(role="user", content="30분 뒤에 스탠드업 준비하라고 알려줘."),
        Message(role="assistant",
                thought="'30분 뒤'는 상대 시간이라 기준 시각이 필요하다. "
                        "get_current_time을 먼저 호출한다.",
                tool_calls=[ToolCall("get_current_time", {"timezone": "Asia/Seoul"})]),
        Message(role="tool", name="get_current_time", result={
            "now": "2026-07-30T09:40:00+09:00", "timezone": "Asia/Seoul",
            "weekday": "Thursday"}),
        Message(role="assistant",
                thought="09:40 + 30분 = 10:10. 절대 시각으로 알림을 건다.",
                tool_calls=[ToolCall("set_reminder", {
                    "message": "스탠드업 준비",
                    "remind_at": "2026-07-30T10:10:00+09:00",
                })]),
        Message(role="tool", name="set_reminder", result={
            "status": "scheduled", "remind_at": "2026-07-30T10:10:00+09:00",
            "reminder_id": "rem_7c21ab"}),
        Message(role="assistant", thought="예약 완료. 실제 시각을 알려준다.",
                content="10시 10분에 '스탠드업 준비' 알림을 걸어뒀습니다."),
    ]),

    # --- parallel calls -----------------------------------------------------
    S("seed-parallel-en", "en", ["list_tasks", "get_current_time", "search_notes"], [
        Message(role="user", content="What's on my plate today, and what time is it now?"),
        Message(role="assistant",
                thought="Two independent lookups - tasks and the clock. "
                        "Nothing depends on the other, so call both at once.",
                tool_calls=[
                    ToolCall("list_tasks", {"status": "open", "limit": 10}),
                    ToolCall("get_current_time", {"timezone": "Asia/Seoul"}),
                ]),
        Message(role="tool", name="list_tasks", result={
            "count": 2,
            "tasks": [
                {"task_id": "task_11de3f", "title": "Review deploy script",
                 "status": "open", "due_at": "2026-07-30T18:00:00+09:00",
                 "priority": "high"},
                {"task_id": "task_9a0b2c", "title": "Write eval report",
                 "status": "open", "due_at": None, "priority": "normal"},
            ]}),
        Message(role="tool", name="get_current_time", result={
            "now": "2026-07-30T09:40:00+09:00", "timezone": "Asia/Seoul",
            "weekday": "Thursday"}),
        Message(role="assistant",
                thought="Both came back. Lead with the deadline that is today.",
                content="It's 09:40 KST. Two open tasks: **Review deploy script** "
                        "(due 18:00 today, high priority) and **Write eval report** "
                        "(no due date)."),
    ]),

    # --- error recovery -----------------------------------------------------
    S("seed-recovery-ko", "ko", ["update_note", "search_notes"], [
        Message(role="user", content="note_ffffff 노트 제목을 '아카이브'로 바꿔줘."),
        Message(role="assistant",
                thought="사용자가 id를 직접 줬으니 그대로 update_note를 호출한다.",
                tool_calls=[ToolCall("update_note", {
                    "note_id": "note_ffffff", "title": "아카이브"})]),
        Message(role="tool", name="update_note", result={
            "error": "not_found", "details": "no note note_ffffff"}),
        Message(role="assistant",
                thought="그 id는 존재하지 않는다. 오타일 수 있으니 비슷한 노트를 검색해 "
                        "후보를 제시하자.",
                tool_calls=[ToolCall("search_notes", {"query": "아카이브", "limit": 5})]),
        Message(role="tool", name="search_notes", result={"count": 0, "results": []}),
        Message(role="assistant",
                thought="후보도 없다. 추측해서 다른 노트를 건드리면 안 되므로 되묻는다.",
                content="note_ffffff 라는 노트를 찾을 수 없었고, '아카이브'로 검색해도 "
                        "결과가 없었습니다. id를 다시 확인해 주시거나 노트 제목을 알려주세요."),
    ]),

    # --- must ask, must not guess ------------------------------------------
    S("seed-clarify-ko", "ko", ["create_task", "get_current_time", "list_tasks"], [
        Message(role="user", content="할 일 하나 추가해줘."),
        Message(role="assistant",
                thought="create_task는 title이 필수인데 무엇을 추가할지 모른다. "
                        "임의로 지어내지 않고 되묻는다.",
                content="어떤 할 일을 추가할까요? 제목과 (있다면) 기한을 알려주세요."),
    ]),

    # --- irreversible action needs confirmation ----------------------------
    S("seed-confirm-ko", "ko", ["delete_note", "search_notes", "get_note"], [
        Message(role="user", content="note_a13f9c 지워줘."),
        Message(role="assistant",
                thought="삭제는 되돌리기 어렵다. confirm=true로 바로 실행하지 않고 "
                        "어떤 노트인지 확인시켜 준 다음 동의를 받는다.",
                tool_calls=[ToolCall("get_note", {"note_id": "note_a13f9c"})]),
        Message(role="tool", name="get_note", result={
            "note_id": "note_a13f9c", "title": "주간 standup 2026-07-29",
            "body": "- 배포 파이프라인 점검\n", "tags": ["work", "standup"],
            "folder": "work/meetings", "updated_at": "2026-07-29T10:12:00+09:00"}),
        Message(role="assistant",
                thought="대상을 확인했다. 사용자 동의 없이 삭제하지 않는다.",
                content="「주간 standup 2026-07-29」(work/meetings) 노트를 휴지통으로 "
                        "옮길까요? 30일 뒤에는 복구할 수 없습니다. 진행하려면 알려주세요."),
    ]),

    # --- no tool needed -----------------------------------------------------
    S("seed-notool-mixed", "mixed", ["search_notes", "web_search", "create_note"], [
        Message(role="user", content="QLoRA랑 LoRA 차이가 뭐야? 짧게."),
        Message(role="assistant",
                thought="일반 지식 질문이라 도구가 필요 없다. 바로 답한다.",
                content="LoRA는 원본 가중치를 그대로 두고 저랭크 어댑터만 학습합니다. "
                        "QLoRA는 여기에 원본을 4-bit로 양자화해서 얹은 것이라, "
                        "같은 VRAM으로 훨씬 큰 모델을 학습할 수 있습니다. "
                        "학습되는 파라미터는 둘 다 어댑터뿐입니다."),
    ]),

    # --- tool result is empty; do not invent ------------------------------
    S("seed-empty-ko", "ko", ["search_notes", "create_note"], [
        Message(role="user", content="김치찌개 레시피 노트 있어?"),
        Message(role="assistant",
                thought="노트를 검색해 본다.",
                tool_calls=[ToolCall("search_notes", {"query": "김치찌개 레시피"})]),
        Message(role="tool", name="search_notes", result={"count": 0, "results": []}),
        Message(role="assistant",
                thought="결과가 없다. 없다고 말하고 새로 만들지 제안한다. "
                        "내용을 상상해서 답하면 안 된다.",
                content="김치찌개 레시피 노트는 없습니다. 새로 만들어 드릴까요?"),
    ]),
]


def main() -> None:
    out = ROOT / "data" / "seed" / "seed.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)

    failures = 0
    with out.open("w", encoding="utf-8") as fh:
        for sample in SEED:
            problems = check(sample, registry=REG, strict_tools=True)
            if problems:
                failures += 1
                print(f"FAIL {sample.id}")
                for p in problems:
                    print(f"     {p}")
                continue
            fh.write(json.dumps(sample_to_row(sample), ensure_ascii=False) + "\n")

    print(f"\n{len(SEED) - failures}/{len(SEED)} valid -> {out}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
