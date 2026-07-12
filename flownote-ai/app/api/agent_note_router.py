"""에이전트 노트 라우터: 그림판 이미지 인덱싱 및 유사 이미지 검색(내부망 전용).

접근은 내부망(192.168.0.18:8000 / compose 네트워크)만 전제한다.
방(room) 단위 접근 통제는 프로토타입 단계에서 room_id 스코프로만 격리하며,
canvas_socket 의 membership 검증 연동은 후속 단계로 남긴다.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services.agent_note_service import OllamaAgentService
from app.services.ollama_client import OllamaError

router = APIRouter(prefix="/api/agent-note", tags=["agent-note"])
agent_note_service = OllamaAgentService()


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
    try:
        return await agent_note_service.health()
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/index")
async def index_image(
    body: IndexRequest,
    authorization: str | None = Header(default=None),
):
    try:
        return await agent_note_service.index_image(body.room_id, body.image, body.image_ref)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/query")
async def query(
    body: QueryRequest,
    authorization: str | None = Header(default=None),
):
    if not body.image and not body.text:
        raise HTTPException(status_code=400, detail="image 또는 text 중 하나는 필요합니다.")
    try:
        if body.image:
            return await agent_note_service.query_by_image(body.room_id, body.image, body.k)
        return await agent_note_service.query_by_text(body.room_id, body.text or "", body.k)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/ask")
async def ask(
    body: AskRequest,
    authorization: str | None = Header(default=None),
):
    try:
        return await agent_note_service.ask(body.room_id, body.question, body.image, body.k)
    except OllamaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
