from __future__ import annotations

import uuid
from typing import Any

from google.genai import types

from app.core_api import forward_request
from mcpServers.common import no_parameters_schema, ok, schema, string_schema


def _compact_text(value: Any, limit: int = 8000) -> Any:
    if isinstance(value, str):
        return value if len(value) <= limit else f"{value[:limit]}..."
    return value


async def get_note_list(authorization: str | None = None) -> dict[str, Any]:
    """노트 목록과 내용을 반환합니다."""
    notes = forward_request("GET", "/api/notes", authorization)
    if isinstance(notes, list):
        notes = [
            {
                **note,
                "content": _compact_text(note.get("content")) if isinstance(note, dict) else note,
            }
            for note in notes
        ]
    return ok("get_note_list", notes)


async def add_note(
    title: str,
    content_text: str,
    note_id: str | None = None,
    authorization: str | None = None,
) -> dict[str, Any]:
    """텍스트 기반 노트를 생성합니다."""
    body = {
        "id": note_id or str(uuid.uuid4()),
        "title": title,
        "content": [
            {
                "id": str(uuid.uuid4()),
                "type": "paragraph",
                "props": {},
                "content": [{"type": "text", "text": content_text, "styles": {}}],
                "children": [],
            }
        ],
    }
    return ok("add_note", forward_request("POST", "/api/notes", authorization, body))


note_function_declarations = [
    types.FunctionDeclaration(
        name="get_note_list",
        description="Spring Core API에서 노트 목록과 내용을 조회합니다.",
        parameters=no_parameters_schema(),
    ),
    types.FunctionDeclaration(
        name="add_note",
        description="Spring Core API에 텍스트 노트를 생성합니다.",
        parameters=schema(
            types.Type.OBJECT,
            properties={
                "title": string_schema("노트 제목"),
                "content_text": string_schema("노트 본문 텍스트"),
                "note_id": string_schema("선택 사항. 노트 UUID"),
            },
            required=["title", "content_text"],
        ),
    ),
]


note_tool_map = {
    "get_note_list": get_note_list,
    "add_note": add_note,
}
