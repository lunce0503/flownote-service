import uuid
from typing import List

from fastapi import APIRouter, Query, Body

from app.schemas import ChatMessageBase, ChatMessageCreate, ChatMessageDelete
from app.models import ChatMessage
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat")
chat_service = ChatService()

@router.get("/", response_model=List[ChatMessageBase])
async def get_chat_history():
    return await chat_service.get_messages()

@router.post("/", response_model=ChatMessageBase)
async def post_chat_message(user_text: ChatMessage):
    return await chat_service.save_message(user_text)

@router.delete("/{message_id}", response_model=ChatMessage)
async def delete_chat_message(message_id: str):
    return await chat_service.delete_message(uuid.UUID(message_id))

@router.delete("/", response_model=List[ChatMessage])
async def delete_all_chat_messages():
    return await chat_service.delete_all_chat()