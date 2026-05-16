from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

class ChatMessageBase(BaseModel):
    sender: str
    message: str
    timestamp: Optional[datetime] = None
    
class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageRead(ChatMessageBase):
    id: str
    model_config = ConfigDict(from_attributes=True) 

class ChatMessageDelete(BaseModel):
    id: str
    model_config = ConfigDict(from_attributes=True)

    
class TaskBase(BaseModel):
    task_name: str
    category: str = ""
    difficulty_level: int = 1
    status: str = 'TODO'
    estimated_minutes: int = 0
    actual_minutes: int = 0
    due_date: str = "2026-03-31T00:00:00"
    memo: str = ""
    tags: list[str] = []
    
class TaskCreate(TaskBase):
    pass

class TaskRead(TaskBase):
    id: str
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)