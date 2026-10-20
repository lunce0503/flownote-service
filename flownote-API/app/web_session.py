"""First-party web sessions; native clients retain explicit Bearer authentication."""

import json
import os
from http.cookies import CookieError, SimpleCookie
from uuid import UUID

from starlette.responses import JSONResponse

COOKIE_NAME = "__Host-flownote_session"
WEB_HEADER = b"x-flownote-web"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def cookie_authorization(value: str) -> str:
    try:
        cookies = SimpleCookie(value)
        token = str(UUID(cookies[COOKIE_NAME].value))
        return f"Bearer {token}"
    except (CookieError, KeyError, ValueError):
        return ""


class WebSessionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode("latin-1")
        allowed = {value.strip() for value in os.getenv("CORS_ORIGINS", "").split(",") if value.strip()}
        cookie_auth = cookie_authorization(headers.get(b"cookie", b"").decode("latin-1"))
        web_request = headers.get(WEB_HEADER) == b"1" or bool(cookie_auth)
        method = scope.get("method", "GET")
        # SameSite plus a fixed custom header protects mutations, including login CSRF.
        if web_request and (method not in SAFE_METHODS or scope["type"] == "websocket"):
            if origin not in allowed or (scope["type"] == "http" and headers.get(WEB_HEADER) != b"1"):
                if scope["type"] == "websocket":
                    return await send({"type": "websocket.close", "code": 1008})
                return await JSONResponse({"error": "허용되지 않은 웹 요청입니다."}, status_code=403)(scope, receive, send)
        if cookie_auth and b"authorization" not in headers:
            scope = {**scope, "headers": [*scope.get("headers", []), (b"authorization", cookie_auth.encode())]}
        path = scope.get("path", "")
        login = web_request and method == "POST" and path == "/api/users/login"
        logout = web_request and method == "POST" and path in {"/api/users/logout", "/api/users/logout-all"}
        if not login and not logout:
            async def private_send(message):
                if message["type"] == "http.response.start" and (web_request or b"authorization" in headers):
                    response_headers = [(key, value) for key, value in message["headers"] if key.lower() != b"cache-control"]
                    message = {**message, "headers": [*response_headers, (b"cache-control", b"no-store")]}
                await send(message)
            return await self.app(scope, receive, private_send)
        start = None
        body = bytearray()

        async def intercept(message):
            nonlocal start
            if message["type"] == "http.response.start":
                start = message
            elif message["type"] == "http.response.body":
                body.extend(message.get("body", b""))
                if message.get("more_body", False):
                    return
                assert start is not None
                response_headers = [(key, value) for key, value in start["headers"] if key.lower() not in {b"content-length", b"content-encoding"}]
                response_headers.append((b"cache-control", b"no-store"))
                if 200 <= start["status"] < 300:
                    if login:
                        data = json.loads(body)
                        token = str(UUID(data.pop("token")))
                        # This value is only a UI marker; the credential is HttpOnly.
                        data["token"] = "web-session"
                        body[:] = json.dumps(data).encode()
                        cookie = f"{COOKIE_NAME}={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000"
                    else:
                        cookie = f"{COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"
                    response_headers.append((b"set-cookie", cookie.encode()))
                await send({**start, "headers": response_headers})
                await send({"type": "http.response.body", "body": bytes(body)})

        await self.app(scope, receive, intercept)
