from fastapi import APIRouter, Query, Body, Header

from app.services.agent_service import AgentService

router = APIRouter(prefix="/api/aiclient")
agent_service = AgentService()

@router.get("/ask_stream")
async def ask_stream(
    prompt: str = Query(..., alias="prompt"),
    authorization: str | None = Header(default=None),
):
    return await agent_service.ask_to_ai(prompt, authorization)

@router.post("/ask_stream")
async def ask_stream_post(
    user_text: str = Body(..., embed=True),
    authorization: str | None = Header(default=None),
):
    return await agent_service.post_ask_to_ai(user_text, authorization)
