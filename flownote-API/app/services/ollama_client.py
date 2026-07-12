"""내부망 Ollama(gemma4:e2b + embeddinggemma) 호출용 얇은 async HTTP 클라이언트.

무거운 ML 의존성은 ollama 컨테이너에만 두고, flownote-API는 httpx 로만 호출한다.
접근은 compose 네트워크 내부의 ollama:11434 (호스트 포트 미노출 · 클라우드 미배포).
"""

from __future__ import annotations

import os
from typing import Any

import httpx


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "gemma4:e2b-it-qat")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma")
# CPU 추론이라 첫 요청은 모델 로딩으로 지연이 크다(수십 초). 넉넉히 잡는다.
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "180"))

# CPU 단일 사용 전제의 기본 샘플링/컨텍스트 옵션(usage 문서 기준)
DEFAULT_CHAT_OPTIONS: dict[str, Any] = {
    "num_ctx": 4096,
    "num_predict": 256,
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": 64,
}


class OllamaError(RuntimeError):
    """Ollama 호출 실패를 관찰 가능하게 만들되 비밀값은 노출하지 않는다."""


def strip_data_uri(image: str) -> str:
    """`data:image/png;base64,....` 형태면 prefix 를 떼고 순수 base64 만 반환."""
    if not image:
        return image
    marker = "base64,"
    if image.startswith("data:") and marker in image:
        return image.split(marker, 1)[1]
    return image


class OllamaClient:
    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        chat_model: str = OLLAMA_CHAT_MODEL,
        embed_model: str = OLLAMA_EMBED_MODEL,
        timeout: float = OLLAMA_TIMEOUT,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._chat_model = chat_model
        self._embed_model = embed_model
        self._timeout = timeout

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as exc:
            raise OllamaError(f"Ollama {path} 응답 오류: {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise OllamaError(f"Ollama {path} 요청 실패: {exc.__class__.__name__}") from exc

    async def _get(self, path: str) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            raise OllamaError(f"Ollama {path} 요청 실패: {exc.__class__.__name__}") from exc

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        think: bool = False,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """/api/chat 호출 후 message 객체를 반환한다(tool_calls 포함 가능)."""
        payload: dict[str, Any] = {
            "model": self._chat_model,
            "stream": False,
            "think": think,
            "messages": messages,
            "options": {**DEFAULT_CHAT_OPTIONS, **(options or {})},
        }
        if tools:
            payload["tools"] = tools
        data = await self._post("/api/chat", payload)
        return data.get("message", {}) or {}

    async def caption_image(self, image_b64: str, prompt: str) -> str:
        """멀티모달 gemma4 로 이미지를 텍스트 캡션으로 변환한다."""
        message = {
            "role": "user",
            "content": prompt,
            "images": [strip_data_uri(image_b64)],
        }
        result = await self.chat([message])
        return (result.get("content") or "").strip()

    async def embed(self, text: str) -> list[float]:
        """embeddinggemma 로 텍스트 임베딩 벡터를 얻는다."""
        data = await self._post("/api/embed", {"model": self._embed_model, "input": text})
        embeddings = data.get("embeddings") or []
        if not embeddings or not isinstance(embeddings, list):
            raise OllamaError("Ollama 임베딩 응답이 비어 있습니다.")
        return list(embeddings[0])

    async def tags(self) -> dict[str, Any]:
        """/api/tags — 내부망 도달 및 로드된 모델 확인용."""
        return await self._get("/api/tags")
