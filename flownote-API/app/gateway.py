"""API 게이트웨이 라우팅.

flownote-API는 클라이언트의 `/api/**` 요청을 받아 요청 경로에 따라 알맞은 백엔드로 전달한다.

- `/api/canvas/**`        → flownote-canvas(Go) : CANVAS_API_BASE_URL
- 그 외 코어 `/api/**`    → flownote-server(Spring) : CORE_API_BASE_URL
- flownote-API가 직접 제공하는 백엔드(AI/에이전트 노트/주식/채팅/소셜)는 각 라우터가
  먼저 매칭되어 로컬에서 처리되고, 이 catch-all은 마지막에 평가되어 나머지만 프록시한다.

이 레이어는 기존 직결 경로를 깨지 않고 추가된다: 프론트가 `VITE_CORE_API_URL`/`VITE_CANVAS_API_URL`을
게이트웨이로 모으면 flownote-API가 단일 진입점(리버스 프록시)으로 동작한다.
"""

import os

import httpx
from fastapi import APIRouter, Request, Response

CORE_API_BASE_URL = (os.getenv("CORE_API_BASE_URL") or os.getenv("SPRING_API_URL") or "http://spring-server:8080").rstrip("/")
CANVAS_API_BASE_URL = (os.getenv("CANVAS_API_BASE_URL") or CORE_API_BASE_URL).rstrip("/")

# 홉 단위 헤더는 프록시가 다시 계산해야 하므로 그대로 전달하지 않는다.
_HOP_BY_HOP = {
    "host", "content-length", "connection", "keep-alive", "transfer-encoding",
    "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailer",
    "content-encoding",
}

router = APIRouter()


def _target_base(path: str) -> str:
    """요청 경로로 백엔드를 결정한다."""
    if path == "canvas" or path.startswith("canvas/"):
        return CANVAS_API_BASE_URL
    return CORE_API_BASE_URL


async def _proxy(request: Request, target_base: str, path: str) -> Response:
    url = f"{target_base}/api/{path}"
    forward_headers = {
        key: value for key, value in request.headers.items() if key.lower() not in _HOP_BY_HOP
    }
    body = await request.body()
    timeout = httpx.Timeout(connect=5, read=180, write=35, pool=5)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            upstream = await client.request(
                request.method,
                url,
                headers=forward_headers,
                params=request.query_params,
                content=body if body else None,
            )
    except httpx.RequestError as error:
        return Response(
            content=f'{{"error":"upstream 요청 실패: {error.__class__.__name__}","retryable":true}}',
            status_code=502,
            media_type="application/json",
        )

    response_headers = {
        key: value for key, value in upstream.headers.items() if key.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )


@router.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def gateway(request: Request, path: str) -> Response:
    """flownote-API가 직접 처리하지 않는 모든 /api/** 요청을 적절한 백엔드로 프록시한다."""
    return await _proxy(request, _target_base(path), path)
