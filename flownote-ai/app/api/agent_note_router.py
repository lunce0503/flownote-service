"""Compatibility responses for the retired LAN-only Ollama integration."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/agent-note", tags=["agent-note"])


@router.get("/health")
async def health():
    return {"enabled": False, "ollama": "disabled", "scope": "removed"}


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def removed(path: str):
    raise HTTPException(status_code=410, detail="The local agent-note integration has been removed.")
