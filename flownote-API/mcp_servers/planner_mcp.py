from google.genai import types

# ── 실제 실행 함수 ──────────────────────────────────────────
# `Task` 관련 함수
async def add_task_item(task_id: str, task_name: str, due_date: str) -> str:
    """새로운 작업을 추가합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 저장은 프론트엔드의 Spring API 호출로 처리해야 합니다."
    
async def get_task_list() -> str:
    """현재 저장된 모든 작업 목록을 반환합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 조회는 Spring API에서 처리해야 합니다."
    
async def update_task_status(task_id: str, status: str) -> str:
    """작업의 상태를 업데이트합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 수정은 Spring API에서 처리해야 합니다."
   
async def update_task_category(task_id: str, category: str) -> str:
    """작업의 분류(카테고리)를 업데이트합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 수정은 Spring API에서 처리해야 합니다."

async def update_task_due_date(task_id: str, due_date: str) -> str:
    """작업의 마감일을 업데이트합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 수정은 Spring API에서 처리해야 합니다."
        
async def update_task_estimated_minutes(task_id:str, estimated_minutes:str) -> str:
    """작업의 예상 시간을 업데이트합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 수정은 Spring API에서 처리해야 합니다."

async def delete_task_item(task_id: str) -> str:
    """작업을 삭제합니다."""
    return "Planner MCP 도구는 Spring Core API 기반으로 이전 중입니다. 현재 작업 삭제는 Spring API에서 처리해야 합니다."
  
# ── Gemini에 넘길 도구 선언 ──────────────────────────────────
mcp_tools = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="get_task_list",
            description="현재 저장된 모든 작업 목록을 반환합니다.",
            parameters=types.Schema(type=types.Type.NULL)
        ),
        types.FunctionDeclaration(
            name="add_task_item",
            description="새로운 작업을 추가합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)"),
                    "task_name": types.Schema(type=types.Type.STRING, description="작업 이름"),
                    "due_date": types.Schema(type=types.Type.STRING, description="마감일 (ISO 8601 형식)")
                },
                required=["task_id", "task_name"]
            )
        ),
        types.FunctionDeclaration(
            name="update_task_status",
            description="작업의 상태를 업데이트합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)"),
                    "status": types.Schema(type=types.Type.STRING, description="업데이트할 상태 (예: 'TODO', 'IN_PROGRESS', 'DONE')")
                },
                required=["task_id", "status"]
            )
        ),
        types.FunctionDeclaration(
            name="delete_task_item",
            description="작업을 삭제합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)")
                },
                required=["task_id"]
            )
        ),
        types.FunctionDeclaration(
            name="update_task_due_date",
            description="작업의 마감일을 업데이트합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)"),
                    "due_date": types.Schema(type=types.Type.STRING, description="업데이트할 마감일 (ISO 8601 형식)")
                },
                required=["task_id", "due_date"]
            )
        ),
        types.FunctionDeclaration(
            name="update_task_estimated_minutes",
            description="작업의 예상시간을 업데이트합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)"),
                    "estimated_minutes": types.Schema(type=types.Type.STRING, description="업데이트할 예상시간 (ISO 8601 형식)")
                },
                required=["task_id", "estimated_minutes"]
            )
        ),types.FunctionDeclaration(
            name="update_task_category",
            description="작업의 예상시간을 업데이트합니다.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "task_id": types.Schema(type=types.Type.STRING, description="작업의 고유 ID (UUID)"),
                    "category": types.Schema(type=types.Type.STRING, description="작업의 카테고리")
                },
                required=["task_id", "category"]
            )
        ),
    ])
]

# ── 실제 함수 실행용 매핑 ─────────────────────────────────────
tool_map = {
    "add_task_item": add_task_item,
    "get_task_list": get_task_list,
    "update_task_status": update_task_status,
    "update_task_due_date": update_task_due_date,
    "update_task_estimated_minutes": update_task_estimated_minutes,
    "update_task_category":update_task_category,
    "delete_task_item": delete_task_item,
}
