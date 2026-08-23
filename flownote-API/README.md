# Flownote API Gateway

FastAPI 기반 단일 공개 API 진입점이다. 자체 도메인 데이터를 저장하지 않고 `/api/**` 요청을 경로에 따라 Spring, Go canvas, Go serve, Python AI 서비스로 스트리밍 프록시한다. Canvas Socket.IO 중계도 이 서비스가 담당한다.

| 경로 | upstream |
| --- | --- |
| `/api/canvas`, `/api/notes`, `/api/note-folders`, `/uploads` | `flownote-canvas` |
| `/api/diary`, `/api/schedule-items`, `/api/tasks`, `/api/stocks`, `/api/social`, `/api/chat`, `/api/feedback` | `flownote-serve` |
| `/api/aiclient`, `/api/agent-note`, `/api/market` | `flownote-ai` |
| 나머지 `/api/**` | `flownote-server` |

## 검증

```bash
uv run pytest -q
```

Railway 서비스명은 `flownote-api`, healthcheck는 `/`이다. 운영 클라이언트는 이 서비스의 공개 HTTPS URL만 API base URL로 사용한다.
