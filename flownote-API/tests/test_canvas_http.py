from unittest.mock import AsyncMock
import uuid

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app import canvas_http, canvas_socket


@pytest.fixture
def setup(monkeypatch):
    sio = AsyncMock()
    forward = AsyncMock()
    monkeypatch.setattr(canvas_socket, "_forward_json_timed", forward)
    monkeypatch.setattr(canvas_http, "require_user_id", AsyncMock(return_value="alice"))
    app = FastAPI()
    app.include_router(canvas_http.create_canvas_http_router(sio))
    return TestClient(app), forward, sio


def test_large_http_save_preserves_mutation_and_broadcast(setup):
    client, forward, sio = setup
    mutation = str(uuid.uuid4())
    forward.return_value = ({"mutationId": mutation, "revision": 4, "duplicate": False}, 5)
    data = {"canvasId": "canvas-1", "mutationId": mutation, "authorization": "Bearer spoofed",
            "payload": {"addedTextBoxes": [{"id": "text-1", "text": "x" * 1_100_000}]}}
    result = client.post("/api/canvas/save", json=data, headers={"Authorization": "Bearer actual"})
    assert result.status_code == 200
    assert result.json()["data"]["mutationId"] == mutation
    args = forward.call_args.args
    assert args[3] == "Bearer actual"
    assert args[4]["mutationId"] == mutation
    assert len(args[4]["addedTextBoxes"][0]["text"]) == 1_100_000
    assert sio.emit.call_args.kwargs["room"] == "canvas:canvas-1"
    assert sio.emit.call_args.args[1]["changes"] is None


def test_http_save_requires_header_auth(setup):
    client, forward, _ = setup
    assert client.post("/api/canvas/save", json={"authorization": "Bearer body-only"}).status_code == 401
    forward.assert_not_called()


def test_invalid_session_rejected_before_large_upstream_request(setup, monkeypatch):
    client, forward, _ = setup
    monkeypatch.setattr(canvas_http, "require_user_id", AsyncMock(side_effect=HTTPException(status_code=401, detail="Unauthorized")))
    response = client.post("/api/canvas/save", json={"payload": {"text": "x" * 1_100_000}},
                           headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    forward.assert_not_called()


def test_http_limit_rejects_before_forwarding(setup, monkeypatch):
    client, forward, _ = setup
    monkeypatch.setattr(canvas_http, "CANVAS_SAVE_MAX_BYTES", 100)
    response = client.post("/api/canvas/save", content=b"x" * 101, headers={"Authorization": "Bearer actual"})
    assert response.status_code == 413
    assert response.json()["retryable"] is False
    forward.assert_not_called()


def test_upstream_authorization_failure_preserved(setup):
    client, forward, _ = setup
    forward.side_effect = HTTPException(status_code=403, detail='{"error":"Forbidden","retryable":false}')
    response = client.post("/api/canvas/save", json={}, headers={"Authorization": "Bearer denied"})
    assert response.status_code == 403
    assert response.json()["retryable"] is False


def test_saved_mutation_remains_successful_when_broadcast_fails(setup):
    client, forward, sio = setup
    mutation = str(uuid.uuid4())
    forward.return_value = ({"mutationId": mutation, "revision": 4, "duplicate": True}, 5)
    sio.emit.side_effect = RuntimeError("Redis unavailable")
    result = client.post("/api/canvas/save", json={"canvasId": "canvas-1", "mutationId": mutation},
                         headers={"Authorization": "Bearer actual"})
    assert result.status_code == 200
    assert result.json()["data"]["duplicate"] is True


@pytest.mark.asyncio
async def test_socket_and_http_use_same_save_contract(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    sio = canvas_socket.create_canvas_socket_server([])
    sio.get_session = AsyncMock(return_value={})
    save = AsyncMock(return_value={"ok": True, "data": {"revision": 1}})
    monkeypatch.setattr(canvas_socket, "save_canvas", save)
    data = {"mutationId": str(uuid.uuid4())}
    result = await sio.handlers["/"]["canvas:save"]("sid", data)
    assert result["ok"]
    save.assert_awaited_once_with(sio, data, "sid")
