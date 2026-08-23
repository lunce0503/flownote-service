import os


def _enabled(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def agent_note_enabled() -> bool:
    return _enabled("AGENT_NOTE_ENABLED")


def capabilities() -> dict[str, dict[str, str | bool]]:
    note_enabled = agent_note_enabled()
    return {
        "agent": {
            "enabled": bool(os.getenv("GEMINI_API_KEY")),
            "provider": "gemini",
        },
        "agent_note": {
            "enabled": note_enabled,
            "provider": "ollama",
            "scope": "internal" if note_enabled else "disabled",
        },
        "market": {"enabled": True, "provider": "public-market-data"},
    }
