import asyncio
import uuid
from typing import Any

from app.core_api import forward_request
from app.schemas import ChatMessageCreate


class ChatService:
    async def save_message(self, authorization: str | None, message: ChatMessageCreate) -> Any:
        return await asyncio.to_thread(
            forward_request,
            "POST",
            "/api/chat/",
            authorization,
            message.model_dump(mode="json"),
        )

    async def get_messages(self, authorization: str | None) -> Any:
        return await asyncio.to_thread(forward_request, "GET", "/api/chat/", authorization)

    async def delete_message(self, authorization: str | None, message_id: uuid.UUID) -> Any:
        return await asyncio.to_thread(forward_request, "DELETE", f"/api/chat/{message_id}", authorization)

    async def delete_all_chat(self, authorization: str | None) -> Any:
        return await asyncio.to_thread(forward_request, "DELETE", "/api/chat/", authorization)
