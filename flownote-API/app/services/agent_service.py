import os
import asyncio
from dotenv import load_dotenv
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

from fastapi import Query, Body
from fastapi.responses import StreamingResponse

from google import genai
from google.genai import types
from mcpServers.registry import mcp_tools, tool_map

load_dotenv()
class AgentService:
    def __init__(self):
        self.GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        self.client = genai.Client(api_key=self.GEMINI_API_KEY)
        self.AI_MODEL = "gemini-3-flash-preview"
        self.SYSTEM_PROMPT = f"""
            너는 사용자의 개인 비서 '플래너 에이전트'야.
            현재 작업, 시간표, 노트의 최종 저장은 Spring Boot Core API가 담당해.
            사용자가 작업/시간표/노트 조회, 생성, 수정, 삭제를 요청하면 사용 가능한 도구를 직접 호출해 처리해.
            도구 실행 뒤에는 어떤 항목이 생성/수정/삭제/조회되었는지 간결하게 알려줘.
            지금 시간은 {str(datetime.now(ZoneInfo("Asia/Seoul")))}이야
            [지침]
            1. FastAPI에서 직접 DB에 저장하지 말고 반드시 도구를 통해 Spring Core API를 호출해.
            2. 답변은 친절하고 간결하게 한국어로 해줘.
            3. 저장/수정 요청에 필수 정보가 부족하면 먼저 질문해.
        """

    def _config(self):
        return types.GenerateContentConfig(
            system_instruction=self.SYSTEM_PROMPT,
            tools=mcp_tools,
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
        )

    async def _run_tool(self, function_call: types.FunctionCall, authorization: str | None) -> dict[str, Any]:
        if not function_call.name or function_call.name not in tool_map:
            return {
                "ok": False,
                "error": f"지원하지 않는 도구입니다: {function_call.name}",
            }

        args = dict(function_call.args or {})
        args["authorization"] = authorization

        try:
            return await tool_map[function_call.name](**args)
        except Exception as exc:
            return {
                "ok": False,
                "tool": function_call.name,
                "error": str(exc),
            }

    def _extract_function_calls(self, response: types.GenerateContentResponse) -> list[types.FunctionCall]:
        function_calls: list[types.FunctionCall] = []
        for candidate in response.candidates or []:
            content = candidate.content
            if not content:
                continue
            for part in content.parts or []:
                if part.function_call:
                    function_calls.append(part.function_call)
        return function_calls

    async def _build_tool_augmented_contents(self, content: str, authorization: str | None) -> list[types.Content]:
        contents: list[types.Content] = [
            types.Content(role="user", parts=[types.Part(text=content)])
        ]

        for _ in range(4):
            response = self.client.models.generate_content(
                model=self.AI_MODEL,
                contents=contents,
                config=self._config(),
            )
            function_calls = self._extract_function_calls(response)
            if not function_calls:
                return contents

            if response.candidates and response.candidates[0].content:
                contents.append(response.candidates[0].content)

            response_parts = []
            for function_call in function_calls:
                result = await self._run_tool(function_call, authorization)
                response_parts.append(types.Part.from_function_response(
                    name=function_call.name or "unknown_tool",
                    response=result,
                ))

            contents.append(types.Content(role="tool", parts=response_parts))

        contents.append(types.Content(
            role="user",
            parts=[types.Part(text="도구 호출이 너무 많이 반복되었습니다. 지금까지의 도구 결과를 요약해서 답변해줘.")],
        ))
        return contents

    # --- API Endpoints ---

    async def ask_to_ai(
        self,
        prompt: str = Query(..., alias="prompt"),
        authorization: str | None = None,
    ): # Body로 데이터를 받음
        async def generate():
            try:
                contents = await self._build_tool_augmented_contents(prompt, authorization)
                responses = self.client.models.generate_content_stream(
                    model=self.AI_MODEL,
                    contents=contents,
                    config=self._config(),
                )
                for chunk in responses:
                    if chunk.text:
                        yield f"{chunk.text}\n\n"
                    await asyncio.sleep(0.01)
            except Exception as e:
                yield f"Error: {str(e)}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    async def post_ask_to_ai(
        self,
        user_text: str = Body(..., embed=True),
        authorization: str | None = None,
    ):
        async def event_generator():
            try:
                contents = await self._build_tool_augmented_contents(user_text, authorization)
                responses = self.client.models.generate_content_stream(
                    model=self.AI_MODEL,
                    contents=contents,
                    config=self._config(),
                )
                for chunk in responses:
                    if chunk.text:
                        yield chunk.text
                    await asyncio.sleep(0.01)
            except Exception as e:
                yield f"\n[Error: {str(e)}]"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
