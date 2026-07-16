"""완전한 API 게이트웨이.

flownote-API는 클라이언트의 모든 `/api/**` 요청을 받아 경로에 따라 백엔드로 프록시하는
단일 진입점(리버스 프록시)이다. 자체 백엔드 로직은 없다.

라우팅:
- `/api/{canvas,notes,note-folders,upload,admin}/**` → flownote-canvas(Go) : CANVAS_API_BASE_URL
- `/uploads/**`(정적 파일)                            → flownote-canvas(Go) : CANVAS_API_BASE_URL
- `/api/{schedule-items,tasks,stocks,social,chat}/**` → flownote-serve(Go)  : SERVE_API_BASE_URL
- `/api/{aiclient,agent-note,market}/**`              → flownote-ai         : AI_API_BASE_URL
- 그 외 코어(인증 `/api/users`, `/api/mobile`)         → flownote-server(Spring): CORE_API_BASE_URL

게이트웨이 기능(완전성):
- 스트리밍 프록시: 응답을 버퍼링하지 않고 청크 단위로 흘려보낸다(SSE `ask_stream`·대용량 호환).
- 콜드스타트 복원력: 연결 수립 실패(ConnectError 등)는 백오프 재시도한다(요청이 상류에 도달하지
  않은 단계이므로 POST에도 안전).
- 요청 추적: `X-Request-ID`를 생성/전파하고 응답에 되돌려 준다.
- 관측: 구조화 액세스 로그(method·path·target·status·latency).
- 헤더 위생: hop-by-hop 헤더 제거, `X-Forwarded-*` 설정.
"""

import asyncio
import logging
import os
import time
import uuid

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger("flownote.gateway")

CORE_API_BASE_URL = (os.getenv("CORE_API_BASE_URL") or os.getenv("SPRING_API_URL") or "http://spring-server:8080").rstrip("/")
CANVAS_API_BASE_URL = (os.getenv("CANVAS_API_BASE_URL") or CORE_API_BASE_URL).rstrip("/")
AI_API_BASE_URL = (os.getenv("AI_API_BASE_URL") or "http://ai-server:8000").rstrip("/")
SERVE_API_BASE_URL = (os.getenv("SERVE_API_BASE_URL") or "http://serve-server:8095").rstrip("/")

# flownote-ai(AI 백엔드)가 소유하는 경로 접두어.
_AI_PREFIXES = ("aiclient", "agent-note", "market")
# flownote-serve(부가기능 백엔드: 일정·작업·주식·소셜·채팅)가 소유하는 접두어 — Spring에서 이관.
_SERVE_PREFIXES = ("schedule-items", "tasks", "stocks", "social", "chat")
# flownote-canvas(Go)가 소유하는 접두어: 캔버스 + 이관된 노트 도메인(노트·폴더·업로드) + 관리자 진단.
_CANVAS_PREFIXES = ("canvas", "notes", "note-folders", "upload", "admin")

# 요청에서 상류로 전달하지 않는 hop-by-hop 헤더.
_REQUEST_STRIP = {
    "host", "content-length", "connection", "keep-alive", "transfer-encoding",
    "upgrade", "proxy-authenticate", "proxy-authorization", "te", "trailer",
}
# 상류 응답에서 클라이언트로 전달하지 않는 헤더(프레이밍은 ASGI 서버가 다시 계산).
# content-encoding은 원시(raw) 바이트를 그대로 흘리므로 유지한다.
_RESPONSE_STRIP = {
    "connection", "keep-alive", "transfer-encoding", "content-length",
    "te", "trailer", "upgrade", "proxy-authenticate",
}

# 연결 수립 실패에 대한 재시도(콜드스타트 대응). 상류가 요청을 받기 전 단계라 안전.
_CONNECT_RETRIES = 2
_RETRY_BACKOFF_S = (0.3, 0.8)
_TIMEOUT = httpx.Timeout(connect=5.0, read=300.0, write=60.0, pool=5.0)

router = APIRouter()


def _target(path: str) -> tuple[str, str]:
    """요청 경로로 (백엔드 base, 백엔드 이름)을 결정한다. 그 외 코어(인증·모바일 설정)는 Spring."""
    head = path.split("/", 1)[0]
    if head in _CANVAS_PREFIXES:
        return CANVAS_API_BASE_URL, "canvas"
    if head in _SERVE_PREFIXES:
        return SERVE_API_BASE_URL, "serve"
    if head in _AI_PREFIXES:
        return AI_API_BASE_URL, "ai"
    return CORE_API_BASE_URL, "core"


def _forward_headers(request: Request, request_id: str) -> dict[str, str]:
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _REQUEST_STRIP}
    headers["X-Request-ID"] = request_id
    client_host = request.client.host if request.client else ""
    if client_host:
        prior = request.headers.get("x-forwarded-for")
        headers["X-Forwarded-For"] = f"{prior}, {client_host}" if prior else client_host
    headers.setdefault("X-Forwarded-Proto", request.url.scheme)
    if request.headers.get("host"):
        headers.setdefault("X-Forwarded-Host", request.headers["host"])
    return headers


@router.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def gateway(request: Request, path: str) -> StreamingResponse:
    """모든 /api/** 요청을 적절한 백엔드로 스트리밍 프록시한다."""
    target_base, target_name = _target(path)
    return await _proxy(request, target_base, target_name, f"/api/{path}")


@router.api_route("/uploads/{path:path}", methods=["GET", "HEAD"])
async def uploads(request: Request, path: str) -> StreamingResponse:
    """노트 에디터 업로드 정적 파일 — 캔버스 백엔드(노트 도메인 소유)가 서빙한다."""
    return await _proxy(request, CANVAS_API_BASE_URL, "canvas", f"/uploads/{path}")


async def _proxy(request: Request, target_base: str, target_name: str, full_path: str) -> StreamingResponse:
    url = f"{target_base}{full_path}"
    path = full_path
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    headers = _forward_headers(request, request_id)
    body = await request.body()
    started = time.monotonic()

    client = httpx.AsyncClient(timeout=_TIMEOUT)
    upstream: httpx.Response | None = None
    last_error: Exception | None = None
    for attempt in range(_CONNECT_RETRIES + 1):
        req = client.build_request(
            request.method, url, headers=headers,
            params=request.query_params, content=body if body else None,
        )
        try:
            upstream = await client.send(req, stream=True)
            break
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as error:
            # 연결 수립 실패: 상류가 요청을 처리하기 전이라 재시도 안전(POST 포함).
            last_error = error
            if attempt < _CONNECT_RETRIES:
                await asyncio.sleep(_RETRY_BACKOFF_S[min(attempt, len(_RETRY_BACKOFF_S) - 1)])
                continue
            break
        except httpx.RequestError as error:
            # 전송 중 오류는 재시도하지 않는다(중복 처리 위험).
            last_error = error
            break

    if upstream is None:
        await client.aclose()
        error_name = last_error.__class__.__name__ if last_error else "UnknownError"
        logger.warning("gateway_upstream_error target=%s path=%s error=%s request_id=%s",
                       target_name, path, error_name, request_id)
        return StreamingResponse(
            iter([f'{{"error":"upstream 요청 실패: {error_name}","retryable":true,"requestId":"{request_id}"}}'.encode()]),
            status_code=502, media_type="application/json",
            headers={"X-Request-ID": request_id},
        )

    response_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in _RESPONSE_STRIP}
    response_headers["X-Request-ID"] = request_id
    status = upstream.status_code
    logger.info("gateway_proxy target=%s method=%s path=%s status=%s latency_ms=%d request_id=%s",
                target_name, request.method, path, status, int((time.monotonic() - started) * 1000), request_id)

    async def body_stream():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        body_stream(),
        status_code=status,
        headers=response_headers,
        media_type=upstream.headers.get("content-type"),
    )
