from app.gateway import AI_API_BASE_URL, CORE_API_BASE_URL, _target


def test_capabilities_route_targets_ai_service():
    assert _target("capabilities") == (AI_API_BASE_URL, "ai")


def test_unknown_api_route_falls_back_to_core_service():
    assert _target("users/me") == (CORE_API_BASE_URL, "core")
