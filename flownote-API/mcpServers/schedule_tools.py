from __future__ import annotations

from typing import Any

from google.genai import types

from app.core_api import forward_request
from mcpServers.common import no_parameters_schema, ok, schema, string_array_schema, string_schema


async def get_schedule_items(authorization: str | None = None) -> dict[str, Any]:
    """현재 저장된 시간표 항목 목록을 반환합니다."""
    return ok("get_schedule_items", forward_request("GET", "/api/schedule-items", authorization))


async def add_schedule_item(
    title: str,
    days_of_week: list[str],
    start_time: str,
    end_time: str,
    category: str | None = None,
    color: str | None = None,
    memo: str | None = None,
    authorization: str | None = None,
) -> dict[str, Any]:
    """새로운 반복 시간표 항목을 추가합니다."""
    body = {
        "title": title,
        "days_of_week": days_of_week,
        "start_time": start_time,
        "end_time": end_time,
        "category": category,
        "color": color or "#0f766e",
        "memo": memo,
        "is_active": True,
    }
    return ok("add_schedule_item", forward_request("POST", "/api/schedule-items", authorization, body))


schedule_function_declarations = [
    types.FunctionDeclaration(
        name="get_schedule_items",
        description="Spring Core API에서 시간표 항목 목록을 조회합니다.",
        parameters=no_parameters_schema(),
    ),
    types.FunctionDeclaration(
        name="add_schedule_item",
        description="Spring Core API에 반복 시간표 항목을 생성합니다.",
        parameters=schema(
            types.Type.OBJECT,
            properties={
                "title": string_schema("시간표 제목"),
                "days_of_week": string_array_schema("MON, TUE, WED, THU, FRI, SAT, SUN 중 반복 요일"),
                "start_time": string_schema("HH:MM 형식 시작 시간"),
                "end_time": string_schema("HH:MM 형식 종료 시간"),
                "category": string_schema("선택 사항. 카테고리"),
                "color": string_schema("선택 사항. HEX 색상"),
                "memo": string_schema("선택 사항. 메모"),
            },
            required=["title", "days_of_week", "start_time", "end_time"],
        ),
    ),
]


schedule_tool_map = {
    "get_schedule_items": get_schedule_items,
    "add_schedule_item": add_schedule_item,
}
