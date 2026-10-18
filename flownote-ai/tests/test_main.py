import sys

from fastapi.testclient import TestClient

from app.main import app


def test_health_imports_without_ai_secrets():
    assert "yfinance" not in sys.modules
    assert "google.genai" not in sys.modules
    assert "mcpServers.registry" not in sys.modules

    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "UP", "service": "flownote-ai"}


def test_capabilities_report_disabled_secret_backed_services(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("AGENT_NOTE_ENABLED", raising=False)

    response = TestClient(app).get("/api/capabilities")

    assert response.status_code == 200
    body = response.json()["capabilities"]
    assert body["agent"]["enabled"] is False
    assert body["agent_note"] == {
        "enabled": False,
        "provider": "ollama",
        "scope": "removed",
    }


def test_agent_note_health_is_explicitly_disabled(monkeypatch):
    monkeypatch.delenv("AGENT_NOTE_ENABLED", raising=False)

    response = TestClient(app).get("/api/agent-note/health")

    assert response.status_code == 200
    assert response.json() == {
        "enabled": False,
        "ollama": "disabled",
        "scope": "removed",
    }


def test_agent_note_cannot_be_reenabled_by_legacy_configuration(monkeypatch):
    monkeypatch.setenv("AGENT_NOTE_ENABLED", "true")

    response = TestClient(app).post(
        "/api/agent-note/query",
        json={"roomId": "canvas-1", "text": "red circle"},
    )

    assert response.status_code == 410
