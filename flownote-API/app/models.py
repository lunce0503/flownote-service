import uuid
from typing import Optional, List
from datetime import datetime, timezone

from sqlalchemy import Column, String, Integer, Boolean, DateTime
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from pydantic import BaseModel, ConfigDict

from app.database import Base

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    sender: Mapped[str] = mapped_column("sender")  # 'user' or 'assistant'
    timestamp: Mapped[Optional[datetime]] = mapped_column("timestamp", default=datetime.now)
    message: Mapped[str] = mapped_column("message")

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    task_name: Mapped[str] = mapped_column("task_name")
    category: Mapped[Optional[str]] = mapped_column("category", default="")

    # DB의 difficulty_level과 맞춤
    difficulty_level: Mapped[Optional[int]] = mapped_column("difficulty", default=1)
    
    status: Mapped[Optional[str]] = mapped_column("status", default='TODO')
    
    # DB의 estimated_minutes와 맞춤
    estimated_minutes: Mapped[Optional[int]] = mapped_column("estimated_minutes", default=0)
    
    # DB의 actual_minutes와 맞춤
    actual_minutes: Mapped[Optional[int]] = mapped_column("actual_minutes", default=0)

    due_date: Mapped[Optional[datetime]] = mapped_column("due_date", default=datetime(2026, 3, 31, 00, 00, 00)) 
    memo: Mapped[Optional[str]] = mapped_column("memo", default="")
    tags: Mapped[list] = mapped_column("tags", ARRAY(String(100)), default=list)
    created_at: Mapped[Optional[datetime]] = mapped_column("created_at", default=datetime.now)
    updated_at: Mapped[Optional[datetime]] = mapped_column("updated_at", default=datetime.now)