import json
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.web_session import COOKIE_NAME, WebSessionMiddleware


def fixture(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://web.example")
    server = FastAPI()
    token = str(uuid4())

    @server.post("/api/users/login")
    async def login():
        return {"token": token, "user": {"id": "alice"}}

    @server.api_route("/api/users/me", methods=["GET", "POST"])
    async def me(request: Request):
        return {"authorization": request.headers.get("authorization")}

    @server.post("/api/users/logout")
    async def logout():
        return {}

    return TestClient(WebSessionMiddleware(server), base_url="https://web.example"), token


def test_web_login_never_exposes_token_and_cookie_auth_survives_reload(monkeypatch):
    client, token = fixture(monkeypatch)
    response = client.post("/api/users/login", headers={"Origin": "https://web.example", "X-Flownote-Web": "1"})
    assert response.status_code == 200
    assert token not in json.dumps(response.json())
    assert response.json()["token"] == "web-session"
    cookie = response.headers["set-cookie"]
    for value in ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]:
        assert value in cookie
    assert client.get("/api/users/me").json()["authorization"] == f"Bearer {token}"
    assert client.post("/api/users/me", headers={"Origin": "https://evil.example", "X-Flownote-Web": "1"}).status_code == 403
    assert client.post("/api/users/me", headers={"Origin": "https://web.example"}).status_code == 403
    response = client.post("/api/users/logout", headers={"Origin": "https://web.example", "X-Flownote-Web": "1"})
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert COOKIE_NAME not in client.cookies


def test_native_bearer_login_and_auth_are_unchanged(monkeypatch):
    client, token = fixture(monkeypatch)
    response = client.post("/api/users/login")
    assert response.json()["token"] == token
    assert "set-cookie" not in response.headers
    assert client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"}).json()["authorization"] == f"Bearer {token}"


def test_login_csrf_is_blocked_before_cookie_is_issued(monkeypatch):
    client, _ = fixture(monkeypatch)
    response = client.post("/api/users/login", headers={"Origin": "https://evil.example", "X-Flownote-Web": "1"})
    assert response.status_code == 403
    assert "set-cookie" not in response.headers
