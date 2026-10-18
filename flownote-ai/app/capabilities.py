import os


def capabilities() -> dict[str, dict[str, str | bool]]:
    return {
        "agent": {
            "enabled": bool(os.getenv("GEMINI_API_KEY")),
            "provider": "gemini",
        },
        "agent_note": {
            "enabled": False,
            "provider": "ollama",
            "scope": "removed",
        },
        "market": {"enabled": True, "provider": "public-market-data"},
    }
