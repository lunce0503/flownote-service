import uuid
from datetime import datetime, timezone

from google.genai import types
from sqlalchemy import select, desc, asc

from app.database import get_async_session
from app.models import Task

# ── 실제 실행 함수 ──────────────────────────────────────────
# `Task` 관련 함수
async def add_task_item(task_id: str, task_name: str, due_date: str) -> str:
    """새로운 작업을 추가합니다."""
    async with get_async_session() as session:
        final_uuid = None
        if task_id:
            try:
                final_uuid = uuid.UUID(task_id)
            except ValueError:
                return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        if final_uuid is None:
            final_uuid = uuid.uuid4()
            
        try:
            # Gemini가 '2025-05-14' 처럼 보낼 경우를 대비
            if len(due_date) == 10: # YYYY-MM-DD 형식
                dt_obj = datetime.strptime(due_date, "%Y-%m-%d")
            else:
                dt_obj = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            
            # DB 저장을 위해 시간대 설정 (필요 시)
            dt_obj = dt_obj.replace(tzinfo=timezone.utc)
        except Exception as e:
            return f"❌ 유효하지 않은 날짜 형식입니다: '{due_date}'. (Error: {e})"
        
        new_task = Task(
            id=final_uuid, 
            task_name=task_name, 
            status='TODO', 
            due_date=dt_obj,
            estimated_minutes=120,
            created_at=datetime.now())
        
        session.add(new_task)
        await session.commit()
        await session.refresh(new_task)
        print("작업 추가 실행됨")
        return f"✅ 성공적으로 추가되었습니다: '{new_task.task_name}' (ID: {new_task.id})"
    
async def get_task_list() -> str:
    """현재 저장된 모든 작업 목록을 반환합니다."""
    async with get_async_session() as session:
        results = (await session.execute(select(Task).order_by(Task.created_at.asc()))).scalars().all()
        if not results:
            return "현재 등록된 작업이 없습니다."
        rows = []
        for t in results:
            status = "✅ 완료" if t.status == 'DONE' else "⏳ 미완료"
            rows.append(f"ID {t.id}: [{status}] {t.task_name} (생성: {t.created_at.strftime('%m-%d %H:%M')if t.created_at else 'N/A'}, 마감: {t.due_date.strftime('%m-%d %H:%M') if t.due_date else 'N/A'})")
        print("작업 가져오기 실행됨")
        return "📋 현재 작업 목록:\n" + "\n".join(rows)
    
async def update_task_status(task_id: str, status: str) -> str:
    """작업의 상태를 업데이트합니다."""
    async with get_async_session() as session:
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        
        task.status = status
        session.add(task)
        await session.commit()
        print("작업 업데이트 실행됨")
        return f"✅ ID {task_id}번 작업이 '{status}' 상태로 업데이트되었습니다."
   
async def update_task_category(task_id: str, category: str) -> str:
    """작업의 분류(카테고리)를 업데이트합니다."""
    async with get_async_session() as session:
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        
        task.category = category
        session.add(task)
        await session.commit()
        print("작업 업데이트 실행됨")
        return f"✅ ID {task_id}번 작업의 카테고리가 '{category}' 로 업데이트되었습니다." 

async def update_task_due_date(task_id: str, due_date: str) -> str:
    """작업의 마감일을 업데이트합니다."""
    async with get_async_session() as session:
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        try:
            if len(due_date) == 10: # YYYY-MM-DD 형식
                dt_obj = datetime.strptime(due_date, "%Y-%m-%d")
            else:
                dt_obj = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            
            # DB 저장을 위해 시간대 설정 (필요 시)
            dt_obj = dt_obj.replace(tzinfo=timezone.utc)
            
            task.due_date = dt_obj
            session.add(task)
            await session.commit()
            print("작업 마감일 업데이트 실행됨")
            return f"✅ ID {task_id}번 작업의 마감일이 '{dt_obj.strftime('%Y-%m-%d %H:%M:%S')}'로 업데이트되었습니다."
        except ValueError:
            return f"❌ 유효하지 않은 날짜 형식입니다: '{due_date}'. ISO 8601 형식이어야 합니다."
        
async def update_task_estimated_minutes(task_id:str, estimated_minutes:str) -> str:
    """작업의 예상 시간을 업데이트합니다."""
    async with get_async_session() as session:
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        try:
            if estimated_minutes:    
                setting_minutes = int(estimated_minutes)            
            else:
                return f"예상시간이 존재하지 않습니다."
            task.estimated_minutes = setting_minutes
            session.add(task)
            await session.commit()
            print("작업 예상시간 업데이트 실행됨")
            return f"✅ ID {task_id}번 작업의 예상시간이 '{setting_minutes}'로 업데이트되었습니다."
        except ValueError:
            return f"❌ 유효하지 않은 예상 시간 형식입니다: '{estimated_minutes}'. ISO 8601 형식이어야 합니다."
async def delete_task_item(task_id: str) -> str:
    """작업을 삭제합니다."""
    async with get_async_session() as session:
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        await session.delete(task)
        try:
            target_uuid = uuid.UUID(task_id)
        except ValueError:
            return f"❌ 유효하지 않은 UUID 형식입니다: '{task_id}'"
        
        task = await session.get(Task, target_uuid)
        if not task:
            return f"❌ ID {task_id}번 작업을 찾을 수 없습니다."
        await session.delete(task)
        await session.commit()
        print("작업 삭제 실행됨")
        return f"✅ ID {task_id}번 작업이 성공적으로 삭제되었습니다."
  
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