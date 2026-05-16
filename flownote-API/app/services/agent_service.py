import os
import asyncio
import uvicorn
from dotenv import load_dotenv
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Optional, Sequence

from fastapi import FastAPI, HTTPException, Query, Depends, Body
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from google import genai
from google.genai import types

from sqlmodel import Session, select, delete, col
from sqlalchemy import desc, asc

from app.database import get_async_session
from app.models import ChatMessage, Task
from mcp_servers.planner_mcp import mcp_tools,tool_map

load_dotenv()
class AgentService:
    def __init__(self):
        self.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.GEMINI_API_KEY)
        self.AI_MODEL = "gemini-3-flash-preview"
        self.SYSTEM_PROMPT = f"""
            너는 사용자의 개인 비서 '플래너 에이전트'야.
            너는 'Planner-Assistant' MCP 서버의 도구들을 사용하여 사용자의 작업을 관리할 수 있어.
            항상 이전 대화 맥락(History)을 기억하고 대답해.
            지금 시간은 {str(datetime.now(ZoneInfo("Asia/Seoul")))}이야
            [지침]
            1. 사용자가 작업에 대해 물어보면, 반드시 'get_task_list' 도구를 먼저 호출해서 현재 DB 상태를 확인해.
            2. 사용자가 작업을 추가해달라고 하면 'add_task_item'을 호출해.
            3. 임의로 작업이 없다고 판단하지 말고, 항상 도구 실행 결과를 바탕으로 대답해.
            4. 답변은 친절하고 간결하게 한국어로 해줘.
        """
    #ai 채팅 로직
    def get_gemini_history(self, db_messages: Sequence[ChatMessage]) -> List[types.Content]:
        """
        DB의 ChatMessage 객체 리스트를 Gemini API용 History 형식으로 변환합니다.
        """
        history = []
        sorted_messages = sorted(db_messages, key=lambda x: x.timestamp if x.timestamp else datetime.min)
        for msg in sorted_messages:
            # Gemini API는 'user'와 'model' 역할을 사용합니다.
            role = "user" if msg.sender == "user" else "model"
            
            # 각 메시지를 Content 객체로 변환
            content = types.Content(
                role=role,
                parts=[types.Part(text=msg.message)]
            )
            history.append(content)
        return history

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
                tools=list(mcp_tools) if mcp_tools else None,
                thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
            ),
        )

        message = content

        while True:
            text_yielded = False
            pending_function_calls = []

            # 스트리밍으로 청크 수신
            for chunk in chat.send_message_stream(message):
                # 텍스트 청크는 바로 yield (스트리밍 효과)
                if chunk.text:
                    yield chunk
                    text_yielded = True

                # 도구 호출 감지
                if chunk.candidates and len(chunk.candidates) > 0:
                    candidate = chunk.candidates[0]
                    if candidate.content and candidate.content.parts:
                        for part in candidate.content.parts:
                            if part.function_call:
                                fc = part.function_call
                                print(f"🛠️ 도구 호출: {fc.name}({dict(fc.args) if fc.args else {}})")
                                pending_function_calls.append(fc)


            # 텍스트가 나왔으면 종료
            if text_yielded:
                break

            # 도구 호출이 없으면 종료
            if not pending_function_calls:
                break

            # ✅ 도구 실행 후 결과를 다음 메시지로 전달
            tool_results = []
            for fc in pending_function_calls:
                fn = tool_map.get(fc.name)
                if fn:
                    result = fn(**dict(fc.args))
                    print(f"📦 도구 결과: {result}")
                else:
                    result = f"도구 '{fc.name}'를 찾을 수 없습니다."

                tool_results.append(
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name,
                            response={"result": result}
                        )
                    )
                )

            # 도구 결과를 담아 다음 루프에서 재전송
            message = tool_results
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
        async with get_async_session() as db:
            new_user_msg = ChatMessage(
                id=uuid.uuid4(),
                sender="user",
                message=user_text,
                timestamp=datetime.now()
            )
            db.add(new_user_msg)
            await db.commit()
            await db.refresh(new_user_msg)
            statement = (
                select(ChatMessage)
                .where(ChatMessage.timestamp != None)
                .order_by(desc(col(ChatMessage.timestamp))) # 최근부터 정렬
                .limit(20)
            )
            db_messages = (await db.execute(statement)).scalars().all()
            
            if not db_messages:
                raise HTTPException(status_code=404, detail="No messages found to process.")

            # 최신 메시지(user)를 질문으로 사용하고, 나머지는 히스토리로 구성
            # db_messages는 desc 정렬이므로 0번 인덱스가 가장 최근
            latest_msg = db_messages[0]
            
            if latest_msg.sender == "user":
                user_text = latest_msg.message
                # 나머지를 Gemini용 히스토리로 변환 (0번 제외한 나머지, 시간순으로 다시 뒤집힘)
                history_messages = db_messages[1:]
                gemini_history = self.get_gemini_history(history_messages)
            else:
                # 마지막 메시지가 유저가 아닐 경우의 처리
                user_text = "마지막 내 질문에 대해 이어서 말해줘."
                gemini_history = self.get_gemini_history(db_messages)

            print(f"✅ 분석된 유저 질문: {user_text}")
            print(f"✅ 포함된 히스토리 수: {len(gemini_history)}")  
            async def event_generator():
                full_response = ""
                try:
                    print("💬 모델에게 질문 전달 중...")
                    print(user_text)
                    # 3. Gemini 스트리밍 호출
                    responses = self.ai_response(user_text, history=gemini_history, model=self.AI_MODEL)
                    
                    for chunk in responses:
                        if chunk.text:
                            content = chunk.text
                            full_response += content
                            yield content 
                        
                        # (선택) 디버깅 로그: 모델이 도구를 호출하는지 터미널에서 확인
                        if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                            
                                for part in chunk.candidates[0].content.parts:
                                    if part.function_call:
                                        print(f"🛠️ 도구 호출 중: {part.function_call.name}")
                                    else:
                                        print("🛠️1 후보는 있지만 도구 호출 정보가 없습니다.")
                        
                        await asyncio.sleep(0.01)

                    if full_response.strip():
                        ai_msg = ChatMessage(
                            id=uuid.uuid4(),
                            sender="model",
                            message=full_response,
                            timestamp=datetime.now()
                        )
                        db.add(ai_msg)
                        print("Add ai message")
                        await db.commit()
                        print(f"✅ AI 응답 저장 성공: {full_response[:15]}...")
                    else:
                        print("⚠️ 모델이 텍스트 응답을 생성하지 않았습니다. (도구 호출만 발생했을 수 있음)")

                except Exception as e:
                    yield f"\n[Error: {str(e)}]"

            return StreamingResponse(event_generator(), media_type="text/event-stream")