import asyncio
from datetime import datetime, timezone
from typing import Literal

import socketio
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core_api import require_user_id

NAMESPACE = "/sync"


class SyncEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resource: Literal["notes", "canvas", "tasks", "schedule", "all"]
    action: str = Field(default="changed", max_length=100)
    noteId: str | None = Field(default=None, max_length=128)
    revision: int | None = Field(default=None, ge=0)
    clientId: str | None = Field(default=None, max_length=128)


def register_sync_namespace(sio: socketio.AsyncServer) -> None:
    checks: dict[str, asyncio.Task] = {}

    async def check_session(sid: str, authorization: str, user_id: str):
        try:
            while True:
                await asyncio.sleep(60)
                if await require_user_id(authorization) != user_id:
                    break
        except asyncio.CancelledError:
            return
        except Exception:
            pass
        await sio.disconnect(sid, namespace=NAMESPACE)

    @sio.on("connect", namespace=NAMESPACE)
    async def connect(sid, environ, auth):
        authorization = auth.get("authorization", "") if isinstance(auth, dict) else ""
        try:
            user_id = await require_user_id(authorization)
        except Exception:
            raise socketio.exceptions.ConnectionRefusedError("Authentication required") from None
        await sio.save_session(sid, {"authorization": authorization, "userId": user_id}, namespace=NAMESPACE)
        await sio.enter_room(sid, f"sync:user:{user_id}", namespace=NAMESPACE)
        checks[sid] = asyncio.create_task(check_session(sid, authorization, user_id))

    @sio.on("disconnect", namespace=NAMESPACE)
    async def disconnect(sid, reason=None):
        task = checks.pop(sid, None)
        if task is not None and task is not asyncio.current_task():
            task.cancel()

    @sio.on("publish", namespace=NAMESPACE)
    async def publish(sid, data):
        try:
            event = SyncEvent.model_validate(data)
            session = await sio.get_session(sid, namespace=NAMESPACE)
            user_id = await require_user_id(session["authorization"])
            if user_id != session["userId"]:
                raise HTTPException(status_code=403, detail="Forbidden")
            await sio.emit("flownote-sync", {
                **event.model_dump(exclude_none=True),
                "at": datetime.now(timezone.utc).isoformat(),
            }, room=f"sync:user:{user_id}", namespace=NAMESPACE)
            return {"ok": True}
        except ValidationError:
            return {"ok": False, "status": 400}
        except HTTPException as error:
            return {"ok": False, "status": error.status_code}
        except Exception:
            return {"ok": False, "status": 503}
