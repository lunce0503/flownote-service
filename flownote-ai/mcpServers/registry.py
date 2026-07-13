from __future__ import annotations

from google.genai import types

from mcpServers.common import ToolHandler
from mcpServers.note_tools import note_function_declarations, note_tool_map
from mcpServers.schedule_tools import schedule_function_declarations, schedule_tool_map
from mcpServers.task_tools import task_function_declarations, task_tool_map


function_declarations = [
    *task_function_declarations,
    *schedule_function_declarations,
    *note_function_declarations,
]

mcp_tools = [
    types.Tool(function_declarations=function_declarations)
]

tool_map: dict[str, ToolHandler] = {
    **task_tool_map,
    **schedule_tool_map,
    **note_tool_map,
}
