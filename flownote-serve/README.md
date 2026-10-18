# flownote-serve (Go)

일기, 일정, 작업, 주식, 소셜, 채팅, 피드백 API를 소유하는 Go 서비스다. 외부 클라이언트는 직접 호출하지 않고 `flownote-API` 게이트웨이의 `/api/**`를 사용한다.

## 주요 경로

- `/api/diary`, `/api/schedule-items`, `/api/tasks`
- `/api/stocks`, `/api/social`, `/api/chat`
- `/api/feedback`, `/api/admin/feedback`
- `/api/feedback/automation` (서비스 토큰 전용, `user_id`와 연락처 제외)
- `/health`

Spring이 발급한 Bearer 세션을 공유 PostgreSQL과 Redis 캐시로 검증한다. PostgreSQL 스키마는 Spring Flyway가 소유하며 큰 memo/message payload는 S3 호환 저장소를 사용한다.

피드백 자동화 feed는 사용자 세션 대신 `FEEDBACK_AUTOMATION_TOKEN`을 사용한다. 토큰이 비어 있으면 항상 `401`을 반환한다. `after` query가 없으면 기존 피드백을 반환하지 않고 현재 cursor만 반환하며, 이후에는 `automation_seq` 기준으로 최대 50건을 오름차순 조회한다.

## 검증

```bash
go test ./...
```

Railway 서비스명은 `flownote-sub`, 소스 디렉터리와 Go 모듈명은 `flownote-serve`, healthcheck는 `/health`이다.
