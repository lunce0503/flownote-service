# 프로젝트 구성 메모리

- `flownote/`는 Vite React 클라이언트다.
- `flownote-next/`는 Prisma/PostgreSQL 연동이 있는 Next.js 앱이다.
- `flownote-API/`는 `uv`로 관리하는 Python FastAPI 서비스다.
- `flownote-server/`는 Gradle로 관리하는 Java 17 Spring Boot 서비스다.
- `flownote-mobile/`는 Expo 앱을 기반으로 애플리케이션을 관리하는 서비스다.
- 이 저장소는 멀티 서비스 워크스페이스이므로 프로젝트 간 API와 DB 계약이 중요하다.
