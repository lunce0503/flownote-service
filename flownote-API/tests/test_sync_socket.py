from unittest.mock import AsyncMock
import json

import pytest
import socketio
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import core_api, sync_socket


@pytest.mark.asyncio
async def test_sync_events_are_authenticated_and_scoped_to_user(monkeypatch):
    sio = socketio.AsyncServer(async_mode="asgi")
    sio.save_session = AsyncMock()
    sio.get_session = AsyncMock(return_value={"authorization": "Bearer valid", "userId": "alice"})
    sio.enter_room = AsyncMock()
    sio.emit = AsyncMock()
    auth = AsyncMock(return_value={"id": "alice"})
    monkeypatch.setattr(core_api, "forward_request_async", auth)
    sync_socket.register_sync_namespace(sio)
    handlers = sio.handlers["/sync"]
    await handlers["connect"]("sid", {}, {"authorization": "Bearer valid"})
    try:
        auth.assert_awaited_with("GET", "/api/users/me", "Bearer valid")
        sio.enter_room.assert_awaited_once_with("sid", "sync:user:alice", namespace="/sync")
        result = await handlers["publish"]("sid", {"resource": "notes", "action": "updated", "clientId": "device-1"})
        assert result["ok"]
        assert sio.emit.call_args.kwargs == {"room": "sync:user:alice", "namespace": "/sync"}
        event = sio.emit.call_args.args[1]
        assert event["clientId"] == "device-1"
        assert "authorization" not in event
        assert "at" in event
        result = await handlers["publish"]("sid", {"resource": "notes", "userId": "bob"})
        assert result == {"ok": False, "status": 400}
        auth.side_effect = HTTPException(status_code=401)
        assert await handlers["publish"]("sid", {"resource": "notes"}) == {"ok": False, "status": 401}
        assert sio.emit.await_count == 1
    finally:
        await handlers["disconnect"]("sid")


@pytest.mark.asyncio
async def test_sync_rejects_missing_or_invalid_auth(monkeypatch):
    sio = socketio.AsyncServer(async_mode="asgi")
    sync_socket.register_sync_namespace(sio)
    auth = AsyncMock(side_effect=HTTPException(status_code=401))
    monkeypatch.setattr(core_api, "forward_request_async", auth)
    for supplied in [None, {}, {"authorization": "Bearer bad"}]:
        with pytest.raises(socketio.exceptions.ConnectionRefusedError):
            await sio.handlers["/sync"]["connect"]("sid", {}, supplied)


def test_sync_websocket_delivery_between_devices_and_user_isolation(monkeypatch):
    async def user(method, path, authorization):
        return {"id": authorization.removeprefix("Bearer ")}

    monkeypatch.setattr(core_api, "forward_request_async", user)
    sio = socketio.AsyncServer(async_mode="asgi")
    sync_socket.register_sync_namespace(sio)

    def join(ws, name):
        assert ws.receive_text().startswith("0")
        ws.send_text('40/sync,' + json.dumps({"authorization": f"Bearer {name}"}))
        return json.loads(ws.receive_text().removeprefix("40/sync,"))["sid"]

    with TestClient(socketio.ASGIApp(sio)) as client:
        with client.websocket_connect("/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}) as first:
            first_sid = join(first, "alice")
            with client.websocket_connect("/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}) as second:
                second_sid = join(second, "alice")
                with client.websocket_connect("/socket.io/?EIO=4&transport=websocket", headers={"Upgrade": "websocket"}) as other:
                    other_sid = join(other, "bob")
                    members = {sid for sid, _ in sio.manager.get_participants("/sync", "sync:user:alice")}
                    assert members == {first_sid, second_sid}
                    assert other_sid not in members
                    first.send_text('42/sync,1["publish",{"resource":"notes","action":"updated"}]')
                    event = first.receive_text()
                    assert event.startswith('42/sync,["flownote-sync",')
                    assert second.receive_text() == event
                    assert first.receive_text() == '43/sync,1[{"ok":true}]'
                    other.send_text('42/sync,1["publish",{"resource":"canvas","action":"bob-only"}]')
                    assert '"bob-only"' in other.receive_text()
                    assert other.receive_text() == '43/sync,1[{"ok":true}]'
