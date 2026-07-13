"""에이전트 노트 서비스: 그림판 이미지 → 캡션 → 임베딩 → 유사 검색.

파이프라인
- index_image: 그림판 이미지를 gemma4 로 캡션 → embeddinggemma 로 임베딩 → 인덱스 저장
- query_by_image / query_by_text: 질의를 임베딩 → 인덱스에서 코사인 유사 top-k 반환
- ask: gemma4 에게 search_similar_images 툴을 주고, 이미지/질문 기반 에이전트 응답 생성

Gemini AgentService 와 분리된 별도 서비스이며, DB 는 flownote-API 전용 sqlite 인덱스만 사용한다.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.services.agent_note_store import AgentNoteStore
from app.services.ollama_client import OllamaClient, strip_data_uri


CAPTION_PROMPT = (
    "이 이미지에 실제로 보이는 것만 한국어로 간결하게 설명해줘. "
    "없는 글자나 숫자를 지어내지 말고, 주요 사물, 형태(원/사각형/삼각형 등), "
    "색상을 명사 중심으로 한 문장으로 나열해."
)

ASK_SYSTEM_PROMPT = (
    "너는 그림판(캔버스) 이미지 검색 에이전트야. "
    "사용자가 이미지나 설명을 주면, 필요할 때 search_similar_images 툴로 "
    "인덱싱된 유사 이미지를 찾아 근거와 함께 간결한 한국어로 답해줘."
)

# gemma4 네이티브 함수호출용 툴 정의(Ollama /api/chat tools 스키마)
SEARCH_SIMILAR_IMAGES_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_similar_images",
        "description": "그림판 이미지 캡션 인덱스에서 질의 텍스트와 유사한 이미지를 검색한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "query_text": {
                    "type": "string",
                    "description": "찾고 싶은 이미지의 특징 설명(사물/형태/색 등)",
                },
                "k": {
                    "type": "integer",
                    "description": "반환할 결과 개수(기본 5)",
                },
            },
            "required": ["query_text"],
        },
    },
}


class OllamaAgentService:
    def __init__(
        self,
        client: OllamaClient | None = None,
        store: AgentNoteStore | None = None,
    ) -> None:
        self._client = client or OllamaClient()
        self._store = store or AgentNoteStore()

    async def index_image(
        self,
        room_id: str,
        image_b64: str,
        image_ref: str | None = None,
    ) -> dict[str, Any]:
        """그림판 이미지를 캡션·임베딩해 인덱스에 저장한다."""
        image = strip_data_uri(image_b64)
        caption = await self._client.caption_image(image, CAPTION_PROMPT)
        if not caption:
            caption = "(캡션 생성 실패)"
        embedding = await self._client.embed(caption)
        entry = await asyncio.to_thread(
            self._store.add, room_id, caption, embedding, image_ref, "index"
        )
        return {"caption": caption, "entry": entry}

    async def _search_by_caption(
        self,
        room_id: str,
        caption: str,
        k: int,
        query_kind: str,
    ) -> dict[str, Any]:
        embedding = await self._client.embed(caption)
        matches = await asyncio.to_thread(self._store.search, room_id, embedding, k)
        return {
            "query_kind": query_kind,
            "query_caption": caption,
            "matches": matches,
        }

    async def query_by_image(
        self,
        room_id: str,
        image_b64: str,
        k: int = 5,
    ) -> dict[str, Any]:
        """질의 이미지를 캡션으로 바꾼 뒤 유사 이미지를 검색한다."""
        caption = await self._client.caption_image(strip_data_uri(image_b64), CAPTION_PROMPT)
        return await self._search_by_caption(room_id, caption, k, "image")

    async def query_by_text(
        self,
        room_id: str,
        text: str,
        k: int = 5,
    ) -> dict[str, Any]:
        """텍스트 질의로 유사 이미지를 검색한다."""
        return await self._search_by_caption(room_id, text, k, "text")

    async def ask(
        self,
        room_id: str,
        question: str,
        image_b64: str | None = None,
        k: int = 5,
        max_steps: int = 3,
    ) -> dict[str, Any]:
        """gemma4 에게 search_similar_images 툴을 주고 에이전트 응답을 생성한다."""
        user_message: dict[str, Any] = {"role": "user", "content": question}
        if image_b64:
            user_message["images"] = [strip_data_uri(image_b64)]

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": ASK_SYSTEM_PROMPT},
            user_message,
        ]
        tool_runs: list[dict[str, Any]] = []

        for _ in range(max_steps):
            message = await self._client.chat(messages, tools=[SEARCH_SIMILAR_IMAGES_TOOL])
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                return {
                    "answer": (message.get("content") or "").strip(),
                    "tool_runs": tool_runs,
                }

            messages.append(message)
            for call in tool_calls:
                function = call.get("function", {}) or {}
                arguments = function.get("arguments") or {}
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments)
                    except json.JSONDecodeError:
                        arguments = {}

                if function.get("name") == "search_similar_images":
                    query_text = str(arguments.get("query_text") or question)
                    top_k = int(arguments.get("k") or k)
                    embedding = await self._client.embed(query_text)
                    matches = await asyncio.to_thread(
                        self._store.search, room_id, embedding, top_k
                    )
                    tool_runs.append({"query_text": query_text, "matches": matches})
                    messages.append(
                        {
                            "role": "tool",
                            "content": json.dumps({"matches": matches}, ensure_ascii=False),
                        }
                    )
                else:
                    messages.append(
                        {
                            "role": "tool",
                            "content": json.dumps(
                                {"error": f"unknown tool: {function.get('name')}"}
                            ),
                        }
                    )

        return {
            "answer": "도구 호출이 반복되어 종료했습니다. 검색 결과를 확인해 주세요.",
            "tool_runs": tool_runs,
        }

    async def health(self, room_id: str | None = None) -> dict[str, Any]:
        tags = await self._client.tags()
        models = [model.get("name") for model in tags.get("models", []) if isinstance(model, dict)]
        indexed = await asyncio.to_thread(self._store.count, room_id)
        return {"ollama": "up", "models": models, "indexed": indexed}
