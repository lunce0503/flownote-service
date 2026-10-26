import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.gateway import CANVAS_API_BASE_URL, _target, router


def test_library_routes_to_canvas_owner():
    for path in ["library/books", "library/uploads/id/chunks/0", "library/books/id/lookup"]:
        assert _target(path) == (CANVAS_API_BASE_URL, "canvas")


@pytest.mark.parametrize("path,size", [
    ("/api/library/uploads/id/chunks/0", 1024 * 1024 + 1),
    ("/api/library/uploads", 512 * 1024 + 1),
])
def test_oversized_library_body_is_rejected_before_creating_upstream_client(monkeypatch, path, size):
    def unexpected_client(*args, **kwargs):
        raise AssertionError("Oversized body reached the upstream transport")
    monkeypatch.setattr("app.gateway.httpx.AsyncClient", unexpected_client)
    app = FastAPI()
    app.include_router(router)
    response = TestClient(app).put(path, content=b"x" * size)
    assert response.status_code == 413
