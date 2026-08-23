# Flownote Spring Server

Java 17 Spring Boot 서비스다. 인증, 사용자, 모바일 런타임 설정을 제공하고 공유 PostgreSQL 스키마의 Flyway migration을 소유한다. 작업·노트·캔버스·소셜 등 실행 API는 Go 서비스로 이관되었으므로 새 도메인 API를 이 서비스에 추가하지 않는다.

## 주요 경로

- `/api/users/**`: 가입, 로그인, 사용자 조회
- `/api/mobile/config`: 모바일 공개 런타임 설정
- `/actuator/health`: Railway와 로컬 healthcheck
- `src/main/resources/db/migration/`: 공유 DB 스키마의 유일한 migration 기준

## 실행과 검증

```bash
./gradlew test

# repository root
docker compose up spring-server
```

Railway 서비스명은 `flownote-main`이다. DB, Redis, CORS, 모바일 공개 URL은 환경 변수로 주입하며 실제 값이나 토큰을 저장소에 기록하지 않는다.
