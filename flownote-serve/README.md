# flownote-serve (Go)

일기, 일정, 작업, 주식, 소셜, 채팅, 피드백 API를 소유하는 Go 서비스다. 외부 클라이언트는 직접 호출하지 않고 `flownote-API` 게이트웨이의 `/api/**`를 사용한다.

## 주요 경로

- `/api/diary`, `/api/schedule-items`, `/api/tasks`
- `/api/stocks`, `/api/social`, `/api/chat`
- `/api/feedback`, `/api/admin/feedback`
- `/health`

Spring이 발급한 Bearer 세션을 공유 PostgreSQL과 Redis 캐시로 검증한다. PostgreSQL 스키마는 Spring Flyway가 소유하며 큰 memo/message payload는 S3 호환 저장소를 사용한다.

## 검증

```bash
go test ./...
```

Railway 서비스명은 `flownote-serve`, healthcheck는 `/health`이다.
