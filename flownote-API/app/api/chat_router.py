import uuid
import asyncio
from typing import Any, List

from fastapi import APIRouter, Header

from app.schemas import ChatMessageCreate, ChatMessageRead
from app.core_api import forward_request

router = APIRouter(prefix="/api/chat")

@router.get("/", response_model=List[ChatMessageRead])
async def get_chat_history(authorization: str | None = Header(default=None)):
    return await asyncio.to_thread(forward_request, "GET", "/api/chat/", authorization)

@router.post("/", response_model=ChatMessageRead)
async def post_chat_message(user_text: ChatMessageCreate, authorization: str | None = Header(default=None)):
    return await asyncio.to_thread(forward_request, "POST", "/api/chat/", authorization, user_text.model_dump(mode="json"))

@router.delete("/{message_id}", response_model=ChatMessageRead)
async def delete_chat_message(message_id: str, authorization: str | None = Header(default=None)):
    uuid.UUID(message_id)
    return await asyncio.to_thread(forward_request, "DELETE", f"/api/chat/{message_id}", authorization)

@router.delete("/", response_model=dict[str, Any])
async def delete_all_chat_messages(authorization: str | None = Header(default=None)):
    return await asyncio.to_thread(forward_request, "DELETE", "/api/chat/", authorization)
