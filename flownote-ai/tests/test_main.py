from fastapi.testclient import TestClient

from app.main import app


def test_health_imports_without_ai_secrets():
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
        "scope": "disabled",
    }


def test_agent_note_health_is_explicitly_disabled(monkeypatch):
    monkeypatch.delenv("AGENT_NOTE_ENABLED", raising=False)

    response = TestClient(app).get("/api/agent-note/health")

    assert response.status_code == 200
    assert response.json() == {
        "enabled": False,
        "ollama": "disabled",
        "scope": "internal",
    }


def test_agent_note_requires_authentication_when_enabled(monkeypatch):
    monkeypatch.setenv("AGENT_NOTE_ENABLED", "true")

    response = TestClient(app).post(
        "/api/agent-note/query",
        json={"roomId": "canvas-1", "text": "red circle"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "로그인이 필요합니다."
