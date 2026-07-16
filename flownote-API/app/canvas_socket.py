import asyncio
import base64
import json
import logging
import mimetypes
import re
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import httpx
import socketio
from fastapi import HTTPException

from app.core_api import CORE_API_BASE_URL, forward_request

# 캔버스 부하 분리: 설정 시 캔버스 중계만 전용 Spring 인스턴스로 보낸다. 미설정이면 기존 Core API 그대로.
import os

CANVAS_API_BASE_URL = (os.getenv("CANVAS_API_BASE_URL") or CORE_API_BASE_URL).rstrip("/")

# 대형 필기 백로그(수천 요소)가 한 mutation으로 들어오면 백엔드 저장이 기본 35초를
# 넘길 수 있다. 저장 요청만 별도 타임아웃을 준다. 프론트 소켓 타임아웃(30s)보다 길어도
# 저장이 원장에 기록되면 다음 재시도가 duplicate로 즉시 성공하므로 루프가 끊긴다.
CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS = float(os.getenv("CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS", "90"))

# 증분 동기화: canvas:changed 브로드캐스트에 변경분(payload)을 실어 수신 기기가 전체
# 리로드 없이 델타만 적용하게 한다. 임계 초과 대형 mutation은 생략 → 클라이언트가
# 기존 전체 리로드로 폴백한다(하위 호환: 구 클라이언트는 changes를 무시).
CANVAS_CHANGED_MAX_INLINE_BYTES = int(os.getenv("CANVAS_CHANGED_MAX_INLINE_BYTES", str(256 * 1024)))


DATA_URL_PATTERN = re.compile(r"^data:(?P<content_type>[^;,]+)?(?:;charset=[^;,]+)?;base64,(?P<data>.+)$", re.DOTALL)
logger = logging.getLogger("flownote.canvas_socket")


class CanvasLoadTaskRegistry:
    def __init__(self) -> None:
        self._tasks: dict[tuple[str, str], asyncio.Task[Any]] = {}

    def register(self, sid: str, request_id: str, task: asyncio.Task[Any]) -> None:
        previous = self._tasks.get((sid, request_id))
        if previous is not None and previous is not task:
            previous.cancel()
        self._tasks[(sid, request_id)] = task

    def unregister(self, sid: str, request_id: str, task: asyncio.Task[Any]) -> None:
        if self._tasks.get((sid, request_id)) is task:
            self._tasks.pop((sid, request_id), None)

    def cancel(self, sid: str, request_id: str) -> bool:
        task = self._tasks.pop((sid, request_id), None)
        if task is None:
            return False
        task.cancel()
        return True

    def cancel_all(self, sid: str) -> None:
        matching_keys = [key for key in self._tasks if key[0] == sid]
        for key in matching_keys:
            task = self._tasks.pop(key)
            task.cancel()


def _canvas_query(canvas_id: str | None, trigger: str | None = None) -> str:
    params: dict[str, str] = {}
    if canvas_id:
        params["canvasId"] = canvas_id
    if trigger:
        params["trigger"] = trigger
    return f"?{urllib.parse.urlencode(params)}" if params else ""


def _canvas_room(canvas_id: str) -> str:
    return f"canvas:{canvas_id}"


def _require_room_membership(rooms: Any, canvas_id: str) -> None:
    """발신자가 canvas:join으로 권한 검증을 거쳐 해당 캔버스 룸에 들어와 있는지 확인한다."""
    joined = set(rooms) if rooms is not None else set()
    if _canvas_room(canvas_id) not in joined:
        raise HTTPException(status_code=403, detail="캔버스 세션에 먼저 참여해야 합니다.")


def _normalize_mutation_id(value: Any) -> str:
    if value is None or value == "":
        return str(uuid.uuid4())
    if not isinstance(value, str):
        raise HTTPException(status_code=400, detail="mutationId 형식이 올바르지 않습니다.")
    try:
        return str(uuid.UUID(value))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="mutationId 형식이 올바르지 않습니다.") from error


def _authorization(data: dict[str, Any]) -> str | None:
    value = data.get("authorization")
    return value if isinstance(value, str) and value else None


def _error_response(error: Exception) -> dict[str, Any]:
    if isinstance(error, HTTPException):
        detail = error.detail
        if isinstance(detail, str):
            try:
                parsed_detail = json.loads(detail)
                if isinstance(parsed_detail, dict):
                    return {
                        "ok": False,
                        "status": error.status_code,
                        "error": str(parsed_detail.get("error") or detail),
                        "code": parsed_detail.get("code"),
                        "retryable": parsed_detail.get("retryable"),
                        "retryAfterMs": parsed_detail.get("retryAfterMs"),
                        "requestId": parsed_detail.get("requestId"),
                    }
            except json.JSONDecodeError:
                pass
        return {
            "ok": False,
            "status": error.status_code,
            "error": str(detail),
        }
    return {
        "ok": False,
        "status": 500,
        "error": str(error),
    }


async def _forward_json(
    method: str,
    path: str,
    authorization: str | None = None,
    body: Any | None = None,
    timeout_seconds: float = 35,
) -> Any:
    return await asyncio.to_thread(forward_request, method, path, authorization, body, CANVAS_API_BASE_URL, timeout_seconds)


async def _forward_json_cancellable(
    method: str,
    path: str,
    authorization: str | None = None,
    body: Any | None = None,
) -> Any:
    headers = {"Accept": "application/json"}
    if authorization:
        headers["Authorization"] = authorization
    timeout = httpx.Timeout(connect=5, read=180, write=35, pool=5)
    async with httpx.AsyncClient(base_url=CANVAS_API_BASE_URL, timeout=timeout) as client:
        response = await client.request(method, path, headers=headers, json=body)
        if response.is_error:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        if not response.content:
            return None
        return response.json()


def _combine_canvas_load_results(
    metadata_result: Any,
    elements_result: Any,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    metadata = metadata_result
    elements = elements_result
    if isinstance(elements, BaseException):
        raise elements
    if isinstance(metadata, BaseException):
        warnings.append("캔버스 제목과 수정 시각을 불러오지 못했습니다.")
        metadata = {}
    response_data = {
        **(metadata if isinstance(metadata, dict) else {}),
        "lines": (elements or {}).get("lines", []),
        "images": (elements or {}).get("images", []),
        "textBoxes": (elements or {}).get("textBoxes", []),
        "loadStatus": (elements or {}).get("status", "COMPLETE"),
        "loadWarnings": [*(elements or {}).get("warnings", []), *warnings],
        "revision": (elements or {}).get("revision") or (metadata or {}).get("revision"),
    }
    return response_data, warnings


def _array_count(data: Any, key: str) -> int:
    if not isinstance(data, dict):
        return 0
    value = data.get(key)
    return len(value) if isinstance(value, list) else 0


def _json_size_bytes(data: Any) -> int:
    try:
        return len(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError):
        return 0


async def _forward_json_timed(
    label: str,
    method: str,
    path: str,
    authorization: str | None = None,
    body: Any | None = None,
    timeout_seconds: float = 35,
) -> tuple[Any, int]:
    started_at = time.perf_counter()
    try:
        result = await _forward_json(method, path, authorization, body, timeout_seconds)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info("canvas_core_request_completed label=%s method=%s path=%s elapsed_ms=%s", label, method, path, elapsed_ms)
        return result, elapsed_ms
    except Exception:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.exception("canvas_core_request_failed label=%s method=%s path=%s elapsed_ms=%s", label, method, path, elapsed_ms)
        raise


async def _forward_json_cancellable_timed(
    label: str,
    method: str,
    path: str,
    authorization: str | None = None,
) -> tuple[Any, int]:
    started_at = time.perf_counter()
    try:
        result = await _forward_json_cancellable(method, path, authorization)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info("canvas_core_request_completed label=%s method=%s path=%s elapsed_ms=%s", label, method, path, elapsed_ms)
        return result, elapsed_ms
    except asyncio.CancelledError:
        logger.info("canvas_core_request_cancelled label=%s method=%s path=%s", label, method, path)
        raise
    except Exception:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.exception("canvas_core_request_failed label=%s method=%s path=%s elapsed_ms=%s", label, method, path, elapsed_ms)
        raise


def _upload_canvas_asset_sync(authorization: str | None, file_data_url: str, filename: str | None, fallback_content_type: str | None) -> Any:
    match = DATA_URL_PATTERN.match(file_data_url)
    if not match:
        raise HTTPException(status_code=400, detail="이미지 data URL 형식이 올바르지 않습니다.")

    content_type = match.group("content_type") or fallback_content_type or "application/octet-stream"
    try:
        file_bytes = base64.b64decode(match.group("data"), validate=True)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="이미지 base64 데이터를 읽지 못했습니다.") from error

    safe_filename = filename or f"canvas-image-{uuid.uuid4()}{mimetypes.guess_extension(content_type) or '.bin'}"
    boundary = f"----flownote-canvas-{uuid.uuid4().hex}"
    body = b"".join([
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="image"; filename="{safe_filename}"\r\n'.encode("utf-8"),
        f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
        file_bytes,
        f"\r\n--{boundary}--\r\n".encode("utf-8"),
    ])

    headers = {
        "Accept": "application/json",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    if authorization:
        headers["Authorization"] = authorization

    request = urllib.request.Request(
        f"{CANVAS_API_BASE_URL}/api/canvas/assets",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=error.code, detail=detail) from error
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail=f"Core API request failed: {error.reason}") from error


async def _upload_canvas_asset(authorization: str | None, file_data: dict[str, Any]) -> Any:
    data_url = file_data.get("dataUrl")
    if not isinstance(data_url, str):
        raise HTTPException(status_code=400, detail="이미지 dataUrl이 필요합니다.")
    filename = file_data.get("name")
    content_type = file_data.get("contentType")
    return await asyncio.to_thread(
        _upload_canvas_asset_sync,
        authorization,
        data_url,
        filename if isinstance(filename, str) else None,
        content_type if isinstance(content_type, str) else None,
    )


def create_canvas_socket_server(cors_allowed_origins: list[str]) -> socketio.AsyncServer:
    # REDIS_URL이 있으면 Redis 매니저로 방 브로드캐스트를 공유한다(게이트웨이 replica 확장 대비).
    # 미설정이면 단일 인스턴스 인메모리 매니저 그대로.
    client_manager = None
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        try:
            client_manager = socketio.AsyncRedisManager(redis_url)
        except Exception:  # noqa: BLE001 - Redis 미가용 시 인메모리로 폴백
            logger.warning("socketio_redis_manager_unavailable url_set=True — 인메모리 매니저로 동작")
            client_manager = None

    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=cors_allowed_origins,
        client_manager=client_manager,
        logger=False,
        engineio_logger=False,
    )
    load_tasks = CanvasLoadTaskRegistry()

    @sio.event
    async def connect(sid: str, environ: dict[str, Any], auth: Any) -> bool:
        return True

    @sio.event
    async def disconnect(sid: str) -> None:
        load_tasks.cancel_all(sid)

    async def canvas_join(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            canvas_id = data.get("canvasId")
            if not isinstance(canvas_id, str) or not canvas_id:
                raise HTTPException(status_code=400, detail="canvasId가 필요합니다.")
            authorization = _authorization(data)
            await _forward_json("GET", f"/api/canvas/metadata{_canvas_query(canvas_id)}", authorization)
            await sio.enter_room(sid, _canvas_room(canvas_id))
            return {"ok": True, "data": {"canvasId": canvas_id}}
        except Exception as error:
            return _error_response(error)

    async def canvas_leave(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            canvas_id = data.get("canvasId")
            if isinstance(canvas_id, str) and canvas_id:
                await sio.leave_room(sid, _canvas_room(canvas_id))
            return {"ok": True, "data": None}
        except Exception as error:
            return _error_response(error)

    async def canvas_load(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        started_at = time.perf_counter()
        canvas_id = data.get("canvasId")
        request_id = data.get("requestId")
        if not isinstance(request_id, str) or not request_id:
            request_id = str(uuid.uuid4())
        current_task = asyncio.current_task()
        if current_task is None:
            return _error_response(RuntimeError("캔버스 불러오기 작업을 시작할 수 없습니다."))
        load_tasks.register(sid, request_id, current_task)
        try:
            trigger = data.get("trigger") if isinstance(data.get("trigger"), str) else "selection"
            canvas_query = _canvas_query(canvas_id if isinstance(canvas_id, str) else None, trigger)
            authorization = _authorization(data)
            metadata_result, elements_result = await asyncio.gather(
                _forward_json_cancellable_timed("canvas_metadata", "GET", f"/api/canvas/metadata{canvas_query}", authorization),
                _forward_json_cancellable_timed("canvas_elements", "GET", f"/api/canvas/elements{canvas_query}", authorization),
                return_exceptions=True,
            )
            metadata, metadata_ms = metadata_result if not isinstance(metadata_result, Exception) else (metadata_result, 0)
            elements, elements_ms = elements_result if not isinstance(elements_result, Exception) else (elements_result, 0)
            response_data, warnings = _combine_canvas_load_results(metadata, elements)
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.info(
                "canvas_load_completed canvas_id=%s elapsed_ms=%s metadata_ms=%s elements_ms=%s lines=%s images=%s text_boxes=%s payload_bytes=%s",
                canvas_id,
                elapsed_ms,
                metadata_ms,
                elements_ms,
                _array_count(response_data, "lines"),
                _array_count(response_data, "images"),
                _array_count(response_data, "textBoxes"),
                _json_size_bytes(response_data),
            )
            return {
                "ok": True,
                "data": response_data,
            }
        except asyncio.CancelledError:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.info("canvas_load_cancelled canvas_id=%s request_id=%s elapsed_ms=%s", canvas_id, request_id, elapsed_ms)
            raise
        except Exception as error:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.exception("canvas_load_failed canvas_id=%s elapsed_ms=%s", canvas_id, elapsed_ms)
            return _error_response(error)
        finally:
            load_tasks.unregister(sid, request_id, current_task)

    async def canvas_load_cancel(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        request_id = data.get("requestId")
        if not isinstance(request_id, str) or not request_id:
            return _error_response(HTTPException(status_code=400, detail="requestId가 필요합니다."))
        cancelled = load_tasks.cancel(sid, request_id)
        return {"ok": True, "data": {"requestId": request_id, "cancelled": cancelled}}

    async def canvas_save(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        started_at = time.perf_counter()
        canvas_id = data.get("canvasId")
        mutation_id: str | None = None
        try:
            trigger = data.get("trigger") if isinstance(data.get("trigger"), str) else "automatic"
            canvas_query = _canvas_query(canvas_id if isinstance(canvas_id, str) else None)
            payload = data.get("payload") or {}
            if not isinstance(payload, dict):
                raise HTTPException(status_code=400, detail="저장 payload 형식이 올바르지 않습니다.")
            mutation_id = _normalize_mutation_id(data.get("mutationId") or payload.get("mutationId"))
            request_payload = {
                **payload,
                "mutationId": mutation_id,
                "trigger": trigger,
                "operationId": data.get("operationId") or str(uuid.uuid4()),
                "clientCreatedAt": data.get("clientCreatedAt"),
            }
            logger.info(
                "canvas_save_started canvas_id=%s mutation_id=%s payload_bytes=%s added_lines=%s modified_lines=%s deleted_lines=%s added_images=%s modified_images=%s deleted_images=%s added_text_boxes=%s modified_text_boxes=%s deleted_text_boxes=%s",
                canvas_id,
                mutation_id,
                _json_size_bytes(request_payload),
                _array_count(payload, "addedLines"),
                _array_count(payload, "modifiedLines"),
                _array_count(payload, "deletedLines"),
                _array_count(payload, "addedImages"),
                _array_count(payload, "modifiedImages"),
                _array_count(payload, "deletedImages"),
                _array_count(payload, "addedTextBoxes"),
                _array_count(payload, "modifiedTextBoxes"),
                _array_count(payload, "deletedTextBoxes"),
            )
            response, save_ms = await _forward_json_timed(
                "canvas_save",
                "POST",
                f"/api/canvas/elements/save{canvas_query}",
                _authorization(data),
                request_payload,
                timeout_seconds=CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS,
            )
            if isinstance(canvas_id, str) and canvas_id:
                inline_changes = payload if _json_size_bytes(payload) <= CANVAS_CHANGED_MAX_INLINE_BYTES else None
                await sio.emit(
                    "canvas:changed",
                    {
                        "canvasId": canvas_id,
                        "sourceSid": sid,
                        "mutationId": mutation_id,
                        "revision": (response or {}).get("revision") if isinstance(response, dict) else None,
                        "changes": inline_changes,
                    },
                    room=_canvas_room(canvas_id),
                    skip_sid=sid,
                )
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.info("canvas_save_completed canvas_id=%s mutation_id=%s elapsed_ms=%s core_ms=%s", canvas_id, mutation_id, elapsed_ms, save_ms)
            return {"ok": True, "data": response}
        except Exception as error:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.exception("canvas_save_failed canvas_id=%s mutation_id=%s elapsed_ms=%s", canvas_id, mutation_id, elapsed_ms)
            return _error_response(error)

    async def canvas_line_start(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            canvas_id = data.get("canvasId")
            if not isinstance(canvas_id, str) or not canvas_id:
                raise HTTPException(status_code=400, detail="canvasId가 필요합니다.")
            _require_room_membership(sio.rooms(sid), canvas_id)
            await sio.emit(
                "canvas:line-start",
                {
                    "canvasId": canvas_id,
                    "line": data.get("line"),
                    "sourceSid": sid,
                },
                room=_canvas_room(canvas_id),
                skip_sid=sid,
            )
            return {"ok": True, "data": None}
        except Exception as error:
            return _error_response(error)

    async def canvas_line_points(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            canvas_id = data.get("canvasId")
            if not isinstance(canvas_id, str) or not canvas_id:
                raise HTTPException(status_code=400, detail="canvasId가 필요합니다.")
            _require_room_membership(sio.rooms(sid), canvas_id)
            await sio.emit(
                "canvas:line-points",
                {
                    "canvasId": canvas_id,
                    "lineId": data.get("lineId"),
                    "points": data.get("points"),
                    "sourceSid": sid,
                },
                room=_canvas_room(canvas_id),
                skip_sid=sid,
            )
            return {"ok": True, "data": None}
        except Exception as error:
            return _error_response(error)

    async def canvas_line_end(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            canvas_id = data.get("canvasId")
            if not isinstance(canvas_id, str) or not canvas_id:
                raise HTTPException(status_code=400, detail="canvasId가 필요합니다.")
            _require_room_membership(sio.rooms(sid), canvas_id)
            await sio.emit(
                "canvas:line-end",
                {
                    "canvasId": canvas_id,
                    "lineId": data.get("lineId"),
                    "line": data.get("line"),
                    "sourceSid": sid,
                },
                room=_canvas_room(canvas_id),
                skip_sid=sid,
            )
            return {"ok": True, "data": None}
        except Exception as error:
            return _error_response(error)

    async def canvas_asset_upload(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            file_data = data.get("file")
            if not isinstance(file_data, dict):
                raise HTTPException(status_code=400, detail="업로드할 이미지가 필요합니다.")
            response = await _upload_canvas_asset(_authorization(data), file_data)
            return {"ok": True, "data": response}
        except Exception as error:
            return _error_response(error)

    register_socket_event = sio.on
    if register_socket_event is None:
        raise RuntimeError("Socket.IO event registration is not available.")

    register_socket_event("canvas:join", handler=canvas_join)
    register_socket_event("canvas:leave", handler=canvas_leave)
    register_socket_event("canvas:load", handler=canvas_load)
    register_socket_event("canvas:load-cancel", handler=canvas_load_cancel)
    register_socket_event("canvas:save", handler=canvas_save)
    register_socket_event("canvas:line-start", handler=canvas_line_start)
    register_socket_event("canvas:line-points", handler=canvas_line_points)
    register_socket_event("canvas:line-end", handler=canvas_line_end)
    register_socket_event("canvas:asset-upload", handler=canvas_asset_upload)

    return sio
