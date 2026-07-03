from __future__ import annotations

import uuid
from typing import Any

from google.genai import types

from app.core_api import forward_request_async
from mcpServers.common import (
    integer_schema,
    no_parameters_schema,
    ok,
    schema,
    string_array_schema,
    string_schema,
)


async def get_task_list(authorization: str | None = None) -> dict[str, Any]:
    """현재 저장된 모든 작업 목록을 반환합니다."""
    return ok("get_task_list", await forward_request_async("GET", "/api/tasks", authorization))


async def add_task_item(
    task_name: str,
    task_id: str | None = None,
    due_date: str | None = None,
    category: str | None = None,
    difficulty_level: int | None = None,
    status: str | None = None,
    estimated_minutes: int | None = None,
    memo: str | None = None,
    tags: list[str] | None = None,
    authorization: str | None = None,
) -> dict[str, Any]:
    """새로운 작업을 추가합니다."""
    body = {
        "id": task_id or str(uuid.uuid4()),
        "task_name": task_name,
        "category": category,
        "difficulty_level": difficulty_level or 2,
        "status": status or "TODO",
        "estimated_minutes": estimated_minutes or 30,
        "due_date": due_date,
        "memo": memo,
        "tags": tags or [],
    }
    return ok("add_task_item", await forward_request_async("POST", "/api/tasks", authorization, body))


async def update_task_item(
    task_id: str,
    task_name: str | None = None,
    status: str | None = None,
    category: str | None = None,
    due_date: str | None = None,
    difficulty_level: int | None = None,
    estimated_minutes: int | None = None,
    actual_minutes: int | None = None,
    memo: str | None = None,
    tags: list[str] | None = None,
    authorization: str | None = None,
) -> dict[str, Any]:
    """작업의 이름, 상태, 카테고리, 날짜, 시간, 메모, 태그를 수정합니다."""
    body = {
        key: value
        for key, value in {
            "task_name": task_name,
            "status": status,
            "category": category,
            "due_date": due_date,
            "difficulty_level": difficulty_level,
            "estimated_minutes": estimated_minutes,
            "actual_minutes": actual_minutes,
            "memo": memo,
            "tags": tags,
        }.items()
        if value is not None
    }
    return ok("update_task_item", await forward_request_async("PATCH", f"/api/tasks/{task_id}", authorization, body))


async def delete_task_item(task_id: str, authorization: str | None = None) -> dict[str, Any]:
    """작업을 삭제합니다."""
    return ok("delete_task_item", await forward_request_async("DELETE", f"/api/tasks/{task_id}", authorization))


task_function_declarations = [
    types.FunctionDeclaration(
        name="get_task_list",
        description="Spring Core API에서 사용자의 작업 목록을 조회합니다.",
        parameters=no_parameters_schema(),
    ),
    types.FunctionDeclaration(
        name="add_task_item",
        description="Spring Core API에 새 작업을 생성합니다.",
        parameters=schema(
            types.Type.OBJECT,
            properties={
                "task_name": string_schema("작업 이름"),
                "task_id": string_schema("선택 사항. 작업 UUID"),
                "due_date": string_schema("선택 사항. YYYY-MM-DD 형식 마감일"),
                "category": string_schema("선택 사항. 작업 카테고리"),
                "difficulty_level": integer_schema("선택 사항. 1~3 난이도"),
                "status": string_schema("선택 사항. TODO, DOING, DONE 중 하나"),
                "estimated_minutes": integer_schema("선택 사항. 예상 소요 분"),
                "memo": string_schema("선택 사항. 작업 메모"),
                "tags": string_array_schema("선택 사항. 태그 목록"),
            },
            required=["task_name"],
        ),
    ),
    types.FunctionDeclaration(
        name="update_task_item",
        description="Spring Core API의 기존 작업을 수정합니다.",
        parameters=schema(
            types.Type.OBJECT,
            properties={
                "task_id": string_schema("수정할 작업 UUID"),
                "task_name": string_schema("선택 사항. 새 작업 이름"),
                "status": string_schema("선택 사항. TODO, DOING, DONE 중 하나"),
                "category": string_schema("선택 사항. 새 카테고리"),
                "due_date": string_schema("선택 사항. YYYY-MM-DD 형식 마감일"),
                "difficulty_level": integer_schema("선택 사항. 1~3 난이도"),
                "estimated_minutes": integer_schema("선택 사항. 예상 소요 분"),
                "actual_minutes": integer_schema("선택 사항. 실제 소요 분"),
                "memo": string_schema("선택 사항. 작업 메모"),
                "tags": string_array_schema("선택 사항. 태그 목록"),
            },
            required=["task_id"],
        ),
    ),
    types.FunctionDeclaration(
        name="delete_task_item",
        description="Spring Core API의 작업을 삭제합니다.",
        parameters=schema(
            types.Type.OBJECT,
            properties={"task_id": string_schema("삭제할 작업 UUID")},
            required=["task_id"],
        ),
    ),
]


task_tool_map = {
    "add_task_item": add_task_item,
    "get_task_list": get_task_list,
    "update_task_item": update_task_item,
    "delete_task_item": delete_task_item,
}
