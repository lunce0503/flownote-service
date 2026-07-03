import asyncio
import uuid
from typing import List

from fastapi import APIRouter, Header

from app.core_api import forward_request
from app.schemas import SocialMessageCreate, SocialMessageRead, SocialRoomCreate, SocialRoomRead

router = APIRouter(prefix="/api/social")

@router.get("/", response_model=List[SocialRoomRead])
async def get_social_rooms(authorization: str | None = Header(default=None)):
    return await asyncio.to_thread(forward_request, "GET", "/api/social/", authorization)

@router.post("/", response_model=SocialRoomRead)
async def post_social_room(room: SocialRoomCreate, authorization: str | None = Header(default=None)):
    return await asyncio.to_thread(
        forward_request,
        "POST",
        "/api/social/",
        authorization,
        room.model_dump(mode="json"),
    )

@router.get("/{room_id}", response_model=List[SocialMessageRead])
async def get_social_messages(room_id: str, authorization: str | None = Header(default=None)):
    uuid.UUID(room_id)
    return await asyncio.to_thread(forward_request, "GET", f"/api/social/{room_id}", authorization)

@router.post("/{room_id}", response_model=SocialMessageRead)
async def post_social_message(room_id: str, message: SocialMessageCreate, authorization: str | None = Header(default=None)):
    uuid.UUID(room_id)
    return await asyncio.to_thread(
        forward_request,
        "POST",
        f"/api/social/{room_id}",
        authorization,
        message.model_dump(mode="json"),
    )

@router.delete("/{room_id}/{message_id}", response_model=SocialMessageRead)
async def delete_social_message(room_id: str, message_id: str, authorization: str | None = Header(default=None)):
    uuid.UUID(room_id)
    uuid.UUID(message_id)
    return await asyncio.to_thread(forward_request, "DELETE", f"/api/social/{room_id}/{message_id}", authorization)
