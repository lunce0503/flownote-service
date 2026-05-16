import json
import os
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException

CORE_API_BASE_URL = os.getenv("CORE_API_BASE_URL") or os.getenv("SPRING_API_URL") or "http://spring-server:8080"


def forward_request(method: str, path: str, authorization: str | None = None, body: Any | None = None) -> Any:
    url = f"{CORE_API_BASE_URL.rstrip('/')}{path}"
    data = None if body is None else json.dumps(body, default=str).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if authorization:
        headers["Authorization"] = authorization

    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=error.code, detail=detail)
    except urllib.error.URLError as error:
        raise HTTPException(status_code=502, detail=f"Core API request failed: {error.reason}")
