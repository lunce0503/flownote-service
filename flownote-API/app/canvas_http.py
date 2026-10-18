import json

import socketio
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.canvas_socket import CANVAS_SAVE_MAX_BYTES, _error_response, save_canvas
from app.core_api import require_user_id


def create_canvas_http_router(sio: socketio.AsyncServer) -> APIRouter:
    router = APIRouter()

    @router.post("/api/canvas/save")
    async def save(request: Request):
        authorization = request.headers.get("authorization", "")
        if not authorization.startswith("Bearer ") or not authorization[7:].strip():
            return JSONResponse({"ok": False, "error": "로그인이 필요합니다.", "retryable": False}, status_code=401)
        # Reject invalid sessions before forwarding a large body to an upstream that
        # may close the connection immediately after reading unauthorized headers.
        try:
            await require_user_id(authorization)
        except HTTPException as error:
            result = _error_response(error)
            return JSONResponse(result, status_code=error.status_code)
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > CANVAS_SAVE_MAX_BYTES:
                return JSONResponse({"ok": False, "error": "저장 데이터가 32MB 제한을 초과했습니다.", "retryable": False}, status_code=413)
            body.extend(chunk)
        try:
            data = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            data = None
        if not isinstance(data, dict):
            return JSONResponse({"ok": False, "error": "저장 요청 형식이 올바르지 않습니다.", "retryable": False}, status_code=400)
        # HTTP authentication comes only from the header, never the JSON body.
        data["authorization"] = authorization
        result = await save_canvas(sio, data)
        return JSONResponse(result, status_code=200 if result["ok"] else result.get("status", 500))

    return router
