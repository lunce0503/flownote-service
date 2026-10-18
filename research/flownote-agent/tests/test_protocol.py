"""Guards the Gemma 4 encode <-> parse contract.

Everything here runs without downloading a model: the value grammar, the parser,
and validation are pure text. Tests that need the real chat template live in
test_template.py and skip when the tokenizer is not cached.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from flownote_agent.data.converters import from_glaive, from_internal, from_xlam, sample_to_row
from flownote_agent.data.validate import check
from flownote_agent.protocol import (
    CALL_CLOSE,
    CALL_OPEN,
    CHANNEL_CLOSE,
    CHANNEL_OPEN,
    RESP_OPEN,
    STR,
    TURN_CLOSE,
    Message,
    Sample,
    ToolCall,
    format_argument,
    format_tool_call,
    format_tool_response,
    parse_arguments,
    parse_model_output,
    parse_model_turn,
    to_chat_messages,
    to_chat_tools,
)
from flownote_agent.tools import ToolRegistry


@pytest.fixture(scope="module")
def registry() -> ToolRegistry:
    return ToolRegistry.load()


def simple_sample(registry: ToolRegistry) -> Sample:
    return Sample(
        tools=registry.specs(["search_notes", "get_note"]),
        messages=[
            Message(role="user", content="배포 회의록 찾아줘"),
            Message(role="assistant", thought="검색이 필요하다.",
                    tool_calls=[ToolCall("search_notes", {"query": "배포", "limit": 5})]),
            Message(role="tool", name="search_notes",
                    result={"count": 1, "results": [{"note_id": "note_1"}]}),
            Message(role="assistant", thought="1건 찾음.", content="1건 찾았습니다."),
        ],
    )


# --------------------------------------------------------------------------- #
# value encoding
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("value,expected", [
    ("hello", f"{STR}hello{STR}"),
    ("한국어", f"{STR}한국어{STR}"),
    (5, "5"),
    (-3, "-3"),
    (1.5, "1.5"),
    (True, "true"),
    (False, "false"),
    (None, "null"),
    ([], "[]"),
    ({}, "{}"),
    ([1, "a"], f"[1,{STR}a{STR}]"),
    ({"b": 1, "a": 2}, "{a:2,b:1}"),          # dictsort, like the template
])
def test_format_argument(value, expected):
    assert format_argument(value) == expected


def test_bool_is_not_treated_as_int():
    """bool subclasses int in Python; getting this order wrong emits `1`/`0`
    where the schema demands a boolean."""
    assert format_argument(True) == "true"
    assert format_argument(1) == "1"


def test_nested_structures_round_trip():
    value = {
        "tags": ["work", "한글"],
        "meta": {"count": 3, "ok": True, "note": None},
        "title": "회의, 배포",           # comma inside a delimited string
    }
    assert parse_arguments(format_argument(value)) == value


def test_string_delimiter_protects_structural_characters():
    """The whole point of <|"|>: braces and commas inside a value must not be
    read as structure."""
    value = {"body": '{"a": 1}, [2,3] }}}'}
    assert parse_arguments(format_argument(value)) == value


def test_tool_call_encoding_matches_the_template():
    call = ToolCall("search_notes", {"query": "배포", "limit": 5})
    assert format_tool_call(call) == (
        f'{CALL_OPEN}call:search_notes{{limit:5,query:{STR}배포{STR}}}{CALL_CLOSE}'
    )


def test_tool_response_encoding():
    out = format_tool_response("f", {"ok": True, "n": 2})
    assert out == f"response:f{{n:2,ok:true}}<tool_response|>"


def test_scalar_tool_response_is_wrapped_in_value():
    assert format_tool_response("f", "hi") == f"response:f{{value:{STR}hi{STR}}}<tool_response|>"


# --------------------------------------------------------------------------- #
# parsing model output
# --------------------------------------------------------------------------- #

def thought(text: str) -> str:
    return f"{CHANNEL_OPEN}thought\n{text}\n{CHANNEL_CLOSE}"


def test_parses_a_normal_call_step():
    raw = thought("검색한다") + format_tool_call(
        ToolCall("search_notes", {"query": "배포", "limit": 5})) + RESP_OPEN
    parsed = parse_model_output(raw)
    assert parsed.errors == []
    assert parsed.thought == "검색한다"
    assert parsed.stopped_for_tool is True
    assert [(c.name, c.arguments) for c in parsed.tool_calls] == \
           [("search_notes", {"query": "배포", "limit": 5})]


def test_parses_a_final_answer_step():
    parsed = parse_model_output(thought("끝") + "1건 찾았습니다." + TURN_CLOSE)
    assert parsed.errors == []
    assert parsed.content == "1건 찾았습니다."
    assert not parsed.wants_tool


def test_parallel_calls_in_one_step():
    raw = (thought("둘 다")
           + format_tool_call(ToolCall("list_tasks", {"status": "open"}))
           + format_tool_call(ToolCall("get_current_time", {}))
           + RESP_OPEN)
    parsed = parse_model_output(raw)
    assert parsed.errors == []
    assert [c.name for c in parsed.tool_calls] == ["list_tasks", "get_current_time"]


def test_stops_at_end_of_turn():
    raw = thought("ok") + "답변입니다." + TURN_CLOSE + "\n<|turn>user\n무시할 내용"
    parsed = parse_model_output(raw)
    assert parsed.content == "답변입니다."
    assert "무시할" not in (parsed.content or "")


def test_tool_response_payload_is_not_mistaken_for_content():
    """A full turn contains the environment's response text; it must not leak
    into what we treat as the model's answer."""
    raw = (thought("t")
           + format_tool_call(ToolCall("get_current_time", {}))
           + RESP_OPEN + format_tool_response("get_current_time", {"now": "2026"})
           + thought("t2") + "지금은 2026년입니다." + TURN_CLOSE)
    parsed = parse_model_turn(raw)
    assert parsed.content == "지금은 2026년입니다."
    assert "now" not in (parsed.content or "")
    assert parsed.thoughts == ["t", "t2"]


@pytest.mark.parametrize("raw,expect", [
    (f"{CALL_OPEN}search_notes{{}}{CALL_CLOSE}", "missing 'call:' prefix"),
    (f"{CALL_OPEN}call:{{}}{CALL_CLOSE}", "missing function name"),
    (f"{CALL_OPEN}call:f{CALL_CLOSE}", "missing argument block"),
    (f"{CALL_OPEN}call:f{{a:{STR}unterminated", "unterminated tool_call"),
    (f"{CHANNEL_OPEN}thought\nno close", "unterminated thought channel"),
    ("", "empty model turn"),
])
def test_malformed_output_reports_instead_of_raising(raw, expect):
    parsed = parse_model_output(raw)
    assert any(expect in e for e in parsed.errors), parsed.errors


def test_truncated_call_yields_no_call():
    parsed = parse_model_output(f"{CALL_OPEN}call:search_notes{{query:{STR}배")
    assert not parsed.ok
    assert not parsed.tool_calls


def test_mixing_prose_with_a_call_is_flagged_per_step():
    raw = format_tool_call(ToolCall("get_current_time", {})) + "잠시만요."
    assert any("mixes tool_call" in e for e in parse_model_output(raw).errors)


def test_a_full_turn_may_hold_several_thoughts():
    raw = thought("a") + format_tool_call(ToolCall("get_current_time", {})) + thought("b") + "답"
    assert parse_model_turn(raw).errors == []
    assert any("expected 1 thought" in e for e in parse_model_output(raw).errors)


def test_empty_argument_block_parses_to_empty_dict():
    parsed = parse_model_output(f"{CALL_OPEN}call:list_tasks{{}}{CALL_CLOSE}")
    assert parsed.errors == []
    assert parsed.tool_calls[0].arguments == {}


def test_undelimited_string_is_tolerated_not_crashed():
    """The model is supposed to wrap strings in <|"|>. When it slips, we recover
    the value so eval scores an argument mismatch rather than a parse failure -
    those are different diagnoses."""
    parsed = parse_model_output(f"{CALL_OPEN}call:f{{mode:append}}{CALL_CLOSE}")
    assert parsed.errors == []
    assert parsed.tool_calls[0].arguments == {"mode": "append"}


# --------------------------------------------------------------------------- #
# chat-template message building
# --------------------------------------------------------------------------- #

def test_tools_are_wrapped_for_the_template():
    wrapped = to_chat_tools([{"name": "f", "description": "d", "parameters": {}}])
    assert wrapped[0]["type"] == "function"
    assert wrapped[0]["function"]["name"] == "f"
    # already-wrapped specs pass through untouched
    assert to_chat_tools(wrapped) == wrapped


def test_system_becomes_a_real_system_message(registry):
    """Gemma 4 has a native system role - unlike Gemma 3, nothing gets folded
    into the first user turn."""
    msgs = to_chat_messages(simple_sample(registry))
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


def test_tool_results_fold_into_the_calling_assistant_message(registry):
    """Gemma's native path. The OpenAI-style role:tool path stringifies the whole
    payload, and passing a dict there crashes the template."""
    msgs = to_chat_messages(simple_sample(registry))
    assert [m["role"] for m in msgs] == ["system", "user", "assistant", "assistant"]
    caller = msgs[2]
    assert caller["tool_calls"][0]["function"]["name"] == "search_notes"
    assert caller["tool_responses"][0]["name"] == "search_notes"
    assert caller["tool_responses"][0]["response"]["count"] == 1


def test_thought_maps_to_reasoning(registry):
    msgs = to_chat_messages(simple_sample(registry))
    assert msgs[2]["reasoning"] == "검색이 필요하다."


def test_arguments_stay_a_mapping(registry):
    """The template raises outright if arguments arrive as a JSON string."""
    msgs = to_chat_messages(simple_sample(registry))
    assert isinstance(msgs[2]["tool_calls"][0]["function"]["arguments"], dict)


def test_orphan_tool_result_raises():
    bad = Sample(tools=[], messages=[
        Message(role="user", content="?"),
        Message(role="tool", name="f", result={}),
    ])
    with pytest.raises(ValueError, match="no preceding tool call"):
        to_chat_messages(bad)


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #

def test_valid_sample_passes(registry):
    assert check(simple_sample(registry), registry=registry, strict_tools=True) == []


def test_schema_violation_is_caught(registry):
    bad = Sample(tools=registry.specs(["create_note"]), messages=[
        Message(role="user", content="노트 만들어줘"),
        Message(role="assistant", thought="만든다.",
                tool_calls=[ToolCall("create_note", {"title": "t", "tags": "work"})]),
    ])
    problems = check(bad, registry=registry, strict_tools=True)
    assert any("body" in p for p in problems)
    assert any("tags" in p for p in problems)


def test_enum_violation_is_caught(registry):
    bad = Sample(tools=registry.specs(["update_note"]), messages=[
        Message(role="user", content="수정해줘"),
        Message(role="assistant", thought="수정.",
                tool_calls=[ToolCall("update_note", {"note_id": "n1", "mode": "overwrite"})]),
    ])
    assert any("mode" in p for p in check(bad, registry=registry, strict_tools=True))


def test_unknown_tool_is_caught(registry):
    bad = Sample(tools=registry.specs(["search_notes"]), messages=[
        Message(role="user", content="?"),
        Message(role="assistant", thought="t", tool_calls=[ToolCall("send_email", {})]),
    ])
    assert any("send_email" in p for p in check(bad, registry=registry))


def test_orphan_tool_result_is_caught(registry):
    bad = Sample(tools=[], messages=[
        Message(role="user", content="?"),
        Message(role="tool", name="search_notes", result={}),
        Message(role="assistant", thought="t", content="ok"),
    ])
    assert any("not preceded" in p for p in check(bad, registry=registry))


def test_must_end_on_an_assistant_turn(registry):
    bad = Sample(tools=[], messages=[Message(role="user", content="?")])
    assert any("assistant" in p for p in check(bad, registry=registry))


def test_more_results_than_calls_is_caught(registry):
    bad = Sample(tools=registry.specs(["get_current_time"]), messages=[
        Message(role="user", content="?"),
        Message(role="assistant", thought="t",
                tool_calls=[ToolCall("get_current_time", {})]),
        Message(role="tool", name="get_current_time", result={"now": "x"}),
        Message(role="tool", name="get_current_time", result={"now": "y"}),
        Message(role="assistant", thought="t", content="ok"),
    ])
    assert any("more tool results" in p for p in check(bad, registry=registry))


# --------------------------------------------------------------------------- #
# converters
# --------------------------------------------------------------------------- #

def test_internal_roundtrip(registry):
    original = simple_sample(registry)
    restored = from_internal(json.loads(json.dumps(sample_to_row(original))))
    assert restored is not None
    assert to_chat_messages(restored) == to_chat_messages(original)


def test_xlam_row_with_stringified_json():
    row = {
        "id": 7,
        "query": "What's the weather in Pohang?",
        "tools": json.dumps([{
            "name": "get_weather", "description": "current weather",
            "parameters": {"location": {"type": "string", "description": "city"}},
        }]),
        "answers": json.dumps([{"name": "get_weather", "arguments": {"location": "Pohang"}}]),
    }
    sample = from_xlam(row)
    assert sample is not None
    assert sample.lang == "en"
    call = sample.messages[-1].tool_calls[0]
    assert (call.name, call.arguments) == ("get_weather", {"location": "Pohang"})
    assert sample.tools[0]["parameters"]["type"] == "object"
    assert sample.messages[-1].thought


def test_xlam_rejects_rows_without_tools():
    assert from_xlam({"query": "hi", "tools": "[]", "answers": "[]"}) is None


def test_glaive_transcript():
    row = {
        "system": ('SYSTEM: You are helpful with access to functions -\n'
                   '{"name": "get_stock_price", "description": "price",'
                   ' "parameters": {"type": "object", "properties":'
                   ' {"symbol": {"type": "string"}}, "required": ["symbol"]}}'),
        "chat": (
            "USER: What's AAPL at? ASSISTANT: <functioncall> "
            '{"name": "get_stock_price", "arguments": \'{"symbol": "AAPL"}\'} '
            "<|endoftext|>\n\n"
            'FUNCTION RESPONSE: {"price": 201.4}\n\n'
            "ASSISTANT: AAPL is at $201.40. <|endoftext|>"
        ),
    }
    sample = from_glaive(row)
    assert sample is not None
    assert [m.role for m in sample.messages] == ["user", "assistant", "tool", "assistant"]
    assert sample.messages[1].tool_calls[0].arguments == {"symbol": "AAPL"}
    assert check(sample, registry=ToolRegistry.load()) == []


def test_glaive_rejects_transcript_without_a_call():
    row = {"system": '{"name": "f", "description": "d", "parameters": {}}',
           "chat": "USER: hi ASSISTANT: hello <|endoftext|>"}
    assert from_glaive(row) is None
