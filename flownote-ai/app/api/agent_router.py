from functools import cache

from fastapi import APIRouter, Query, Body, Header

router = APIRouter(prefix="/api/aiclient")


@cache
def _agent_service():
    # Google GenAI와 MCP 선언은 첫 에이전트 요청 전까지 로딩하지 않는다.
    from app.services.agent_service import AgentService

    return AgentService()

@router.get("/ask_stream")
async def ask_stream(
    prompt: str = Query(..., alias="prompt"),
    authorization: str | None = Header(default=None),
):
    return await _agent_service().ask_to_ai(prompt, authorization)

@router.post("/ask_stream")
async def ask_stream_post(
    user_text: str = Body(..., embed=True),
    authorization: str | None = Header(default=None),
):
    return await _agent_service().post_ask_to_ai(user_text, authorization)
