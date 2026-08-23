"""에이전트 노트 라우터: 그림판 이미지 인덱싱 및 유사 이미지 검색(내부망 전용).

모든 기능 요청은 Core API 세션을 검증하고 저장 room key를 사용자 ID로 네임스페이스한다.
같은 room_id를 사용해도 사용자 간 인덱스가 섞이지 않는다.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services.agent_note_service import OllamaAgentService
from app.services.ollama_client import OllamaError
from app.capabilities import agent_note_enabled
from app.core_api import forward_request_async

router = APIRouter(prefix="/api/agent-note", tags=["agent-note"])
agent_note_service = OllamaAgentService()


def require_agent_note() -> None:
    if not agent_note_enabled():
        raise HTTPException(
            status_code=503,
            detail="agent-note는 AGENT_NOTE_ENABLED=true인 내부망 배포에서만 사용할 수 있습니다.",
        )


async def scoped_room_id(room_id: str, authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    user = await forward_request_async("GET", "/api/users/me", authorization)
    user_id = user.get("id") if isinstance(user, dict) else None
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return f"{user_id}:{room_id}"


class IndexRequest(BaseModel):
    room_id: str = Field(..., alias="roomId", min_length=1)
    image: str = Field(..., min_length=1, description="base64 이미지(data URI 허용)")
    image_ref: str | None = Field(default=None, alias="imageRef")

    model_config = {"populate_by_name": True}


class QueryRequest(BaseModel):
    room_id: str = Field(..., alias="roomId", min_length=1)
    image: str | None = Field(default=None, description="base64 질의 이미지(data URI 허용)")
    text: str | None = Field(default=None, description="텍스트 질의(이미지 미제공 시)")
    k: int = Field(default=5, ge=1, le=50)

    model_config = {"populate_by_name": True}


class AskRequest(BaseModel):
    room_id: str = Field(..., alias="roomId", min_length=1)
    question: str = Field(..., min_length=1)
    image: str | None = Field(default=None, description="선택. base64 이미지(data URI 허용)")
    k: int = Field(default=5, ge=1, le=50)

    model_config = {"populate_by_name": True}


@router.get("/health")
async def health():
    if not agent_note_enabled():
        return {"enabled": False, "ollama": "disabled", "scope": "internal"}
    try:
        return {"enabled": True, **await agent_note_service.health()}
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/index")
async def index_image(
    body: IndexRequest,
    authorization: str | None = Header(default=None),
):
    require_agent_note()
    room_id = await scoped_room_id(body.room_id, authorization)
    try:
        return await agent_note_service.index_image(room_id, body.image, body.image_ref)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/query")
async def query(
    body: QueryRequest,
    authorization: str | None = Header(default=None),
):
    require_agent_note()
    if not body.image and not body.text:
        raise HTTPException(status_code=400, detail="image 또는 text 중 하나는 필요합니다.")
    room_id = await scoped_room_id(body.room_id, authorization)
    try:
        if body.image:
            return await agent_note_service.query_by_image(room_id, body.image, body.k)
        return await agent_note_service.query_by_text(room_id, body.text or "", body.k)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/ask")
async def ask(
    body: AskRequest,
    authorization: str | None = Header(default=None),
):
    require_agent_note()
    room_id = await scoped_room_id(body.room_id, authorization)
    try:
        return await agent_note_service.ask(room_id, body.question, body.image, body.k)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
