import uuid
from datetime import datetime, timezone

from sqlmodel import select, delete, col
from sqlalchemy import asc
from fastapi import HTTPException

from app.database import get_async_session
from app.models import ChatMessage


class ChatService:
    def __init__(self):
        pass
    async def save_message(self, message: ChatMessage):
        async with get_async_session() as session:
            raw_ts = str(message.timestamp)
        
            if isinstance(raw_ts, str):
                clean_ts = raw_ts.replace("Z", "+00:00")
                final_timestamp = datetime.fromisoformat(clean_ts)
            else:
                final_timestamp = raw_ts
            if final_timestamp.tzinfo is not None:
                final_timestamp = final_timestamp.replace(tzinfo=None)
            new_message = ChatMessage(
                id=message.id or uuid.uuid4(),
                sender=message.sender,
                timestamp=final_timestamp, 
                message=message.message
            )
            session.add(new_message)
            await session.commit()
            await session.refresh(new_message)
        print(f"data: {new_message}")
        print(f"message: {new_message.message}, sender: {new_message.sender}")
        return new_message
    
    async def get_messages(self):
        async with get_async_session() as session:
            try:
                statement = (
                    select(ChatMessage.id, ChatMessage.sender, ChatMessage.timestamp, ChatMessage.message)
                    .where(ChatMessage.timestamp != None)
                    .order_by(asc(col(ChatMessage.timestamp)))
                ) 
                result = await session.execute(statement)
                messages = [ChatMessage(message=row[3], id=row[0], sender=row[1], timestamp=row[2]) for row in result]
                return messages
            except Exception as e:
                print(f"Error occurred while fetching chat history: {e}")
                raise HTTPException(status_code=500, detail="Internal server error")
    
    async def delete_message(self, message_id: uuid.UUID):
        async with get_async_session() as session:
            statement = (select(ChatMessage).where(ChatMessage.id == message_id))
            result = await session.execute(statement)
            message = result.first()
            if not message:
                raise HTTPException(status_code=404, detail="Chat message not found")
            await session.delete(message)
            await session.commit()        
        return message

    async def delete_all_chat(self):
        async with get_async_session() as session:
            statement = (select(ChatMessage))
            result = await session.execute(statement)
            messages = result.all()
            delete_statement = delete(ChatMessage)
            await session.execute(delete_statement)
            await session.commit()        

        return messages