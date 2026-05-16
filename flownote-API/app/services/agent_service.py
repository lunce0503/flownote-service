import os
import asyncio
from dotenv import load_dotenv
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, Sequence

from fastapi import Query, Body
from fastapi.responses import StreamingResponse

from google import genai
from google.genai import types

load_dotenv()
class AgentService:
    def __init__(self):
        self.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.GEMINI_API_KEY)
        self.AI_MODEL = "gemini-3-flash-preview"
        self.SYSTEM_PROMPT = f"""
            너는 사용자의 개인 비서 '플래너 에이전트'야.
            현재 작업과 노트의 최종 저장은 Spring Boot Core API가 담당해.
            사용자가 저장/조회/수정 작업을 요청하면 프론트엔드가 Spring API를 호출하도록 안내해.
            지금 시간은 {str(datetime.now(ZoneInfo("Asia/Seoul")))}이야
            [지침]
            1. FastAPI에서 직접 DB에 저장하지 마.
            2. 답변은 친절하고 간결하게 한국어로 해줘.
        """

    def ai_response(
        self,
        content:str, 
        history: Optional[Sequence[types.ContentOrDict]] = None, 
        model=""
    ):
        model = self.AI_MODEL
        chat = self.client.chats.create(
            model=model,
            history=list(history) if history else None,        
            config=types.GenerateContentConfig(
                system_instruction=self.SYSTEM_PROMPT,
                tools=None,
                thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
            ),
        )

        message = content

        while True:
            text_yielded = False

            for chunk in chat.send_message_stream(message):
                if chunk.text:
                    yield chunk
                    text_yielded = True

            if text_yielded:
                break

            break
    # --- API Endpoints ---

    async def ask_to_ai(self, prompt: str = Query(..., alias="prompt")): # Body로 데이터를 받음
        async def generate():
            try:
                responses = self.ai_response(prompt, history=[], model=self.AI_MODEL)
                for chunk in responses:
                    if chunk.text:
                        yield f"{chunk.text}\n\n"
                    await asyncio.sleep(0.01)
            except Exception as e:
                yield f"Error: {str(e)}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    async def post_ask_to_ai(self, user_text: str = Body(..., embed=True)):
        async def event_generator():
            try:
                responses = self.ai_response(user_text, history=[], model=self.AI_MODEL)
                for chunk in responses:
                    if chunk.text:
                        yield chunk.text 
                    await asyncio.sleep(0.01)
            except Exception as e:
                yield f"\n[Error: {str(e)}]"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
