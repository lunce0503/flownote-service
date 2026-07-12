from __future__ import annotations

from typing import Any, Awaitable, Callable

from google.genai import types


ToolHandler = Callable[..., Awaitable[dict[str, Any]]]


def ok(action: str, data: Any) -> dict[str, Any]:
    return {"ok": True, "action": action, "data": data}


def schema(
    schema_type: types.Type,
    description: str | None = None,
    properties: dict[str, types.Schema] | None = None,
    required: list[str] | None = None,
    items: types.Schema | None = None,
) -> types.Schema:
    return types.Schema(
        type=schema_type,
        description=description,
        properties=properties,
        required=required,
        items=items,
    )


def string_schema(description: str | None = None) -> types.Schema:
    return schema(types.Type.STRING, description=description)


def integer_schema(description: str | None = None) -> types.Schema:
    return schema(types.Type.INTEGER, description=description)


def string_array_schema(description: str | None = None) -> types.Schema:
    return schema(
        types.Type.ARRAY,
        description=description,
        items=schema(types.Type.STRING),
    )


def no_parameters_schema() -> types.Schema:
    return schema(types.Type.OBJECT, properties={})
