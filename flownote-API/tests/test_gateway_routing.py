from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway import AI_API_BASE_URL, CORE_API_BASE_URL, _target, router


def test_runtime_ai_route_targets_ai_service():
    assert _target("market") == (AI_API_BASE_URL, "ai")


def test_retired_ai_compatibility_routes_do_not_require_ai_service():
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    capabilities = client.get("/api/capabilities")
    removed = client.post("/api/agent-note/query", json={})

    assert capabilities.status_code == 200
    assert capabilities.json()["capabilities"]["agent_note"]["enabled"] is False
    assert removed.status_code == 410


def test_unknown_api_route_falls_back_to_core_service():
    assert _target("users/me") == (CORE_API_BASE_URL, "core")
