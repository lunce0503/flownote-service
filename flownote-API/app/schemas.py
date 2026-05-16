from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

class ChatMessageBase(BaseModel):
    sender: str
    message: str
    timestamp: Optional[datetime] = None
    
class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageRead(ChatMessageBase):
    id: UUID

class SocialMessageBase(BaseModel):
    message: str
    timestamp: Optional[datetime] = None

class SocialMessageCreate(SocialMessageBase):
    id: Optional[UUID] = None

class SocialRoomCreate(BaseModel):
    id: Optional[UUID] = None
    name: Optional[str] = None
    participantIds: Optional[List[UUID]] = None
    participantEmails: Optional[List[str]] = None

class SocialRoomMemberRead(BaseModel):
    id: UUID
    username: str
    nickname: str

class SocialRoomRead(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    name: Optional[str] = None
    members: List[SocialRoomMemberRead]
    lastMessage: Optional[str] = Field(default=None, validation_alias="last_message")
    updatedAt: datetime = Field(validation_alias="updated_at")

class SocialMessageRead(SocialMessageBase):
    id: UUID
    room_id: UUID
    user_id: UUID
    nickname: str
    mine: bool
