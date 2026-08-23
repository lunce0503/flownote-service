# Flownote 시스템 설계

## 아키텍처 지도

Flownote는 Vite 웹과 Expo 모바일이 FastAPI 게이트웨이를 통해 Spring, Go, Python 도메인 서비스에 접근하는 멀티 서비스 애플리케이션이다. 상세 코드맵은 루트 `ARCHITECTURE.md`, 로컬 런타임의 기준은 `docker-compose.yml`이다.

| 하위 프로젝트 | 역할 | 주요 기술 |
| --- | --- | --- |
| `flownote/` | 주요 웹 클라이언트 | React 19, Vite, Tailwind, BlockNote, Socket.IO |
| `flownote-mobile/` | iOS/Android 네이티브 앱과 Railway 웹 테스트 클라이언트 | Expo Router, React Native, SVG |
| `flownote-API/` | 단일 공개 API 게이트웨이와 Canvas Socket.IO 중계 | FastAPI, uv, python-socketio, httpx |
| `flownote-server/` | 인증, 사용자, 모바일 설정, Flyway 스키마 소유 | Java 17, Spring Boot, JDBC, Flyway |
| `flownote-canvas/` | 캔버스, 노트, 폴더, 업로드 | Go, pgx, Redis, S3 |
| `flownote-serve/` | 일기, 일정, 작업, 주식, 소셜, 채팅, 피드백 | Go, pgx, Redis, S3 |
| `flownote-ai/` | 에이전트, 에이전트 노트, 시장 데이터 | FastAPI, uv, Google GenAI, Ollama |
| `docker-compose.yml` | 로컬 통합 오케스트레이션 | PostgreSQL, Redis, 서비스 컨테이너, Ollama |

## 서비스 경계

- 웹과 모바일은 `flownote-API`를 단일 공개 HTTP 진입점으로 사용한다.
- 게이트웨이는 `/api/**` 경로를 실제 도메인 소유 서비스로 전달하며 자체 비즈니스 데이터를 소유하지 않는다.
- 인증·사용자·모바일 설정은 `flownote-server`, 캔버스·노트는 `flownote-canvas`, 일정 등 부가기능은 `flownote-serve`, AI·시장 데이터는 `flownote-ai`가 소유한다.
- Canvas Socket.IO는 `flownote-API`가 중계하고 Redis manager를 통해 복수 replica 확장에 대비한다.
- 모바일은 WebView 래퍼가 아니라 React Native 화면으로 계정, 작업, 노트, 에이전트, 캔버스를 렌더링한다.
- `flownote-next`는 2026-07-28 제거되었으며 실행·배포 대상이 아니다.

## 데이터 소유권

- PostgreSQL 스키마 변경은 `flownote-server/src/main/resources/db/migration/`의 Flyway 마이그레이션이 유일한 기준이다.
- Spring과 두 Go 서비스가 PostgreSQL을 공유하므로 마이그레이션과 실제 소비자 DTO·쿼리를 함께 검증한다.
- 세션 캐시는 Redis, 대용량 본문과 자산은 S3 호환 저장소, 에이전트 노트 인덱스는 AI 서비스의 SQLite 볼륨을 사용한다.
- 사용자별 데이터는 `user_id`를 기준으로 격리한다.
- 업로드 파일, DB 덤프, 토큰과 스토리지 키는 문서나 Git에 넣지 않는다.

## 역량 조합 지점

- 웹 라우트의 단일 등록 지점은 `flownote/src/app/capabilityManifest.tsx`다.
- 새 역량은 `{id, label, nav, enabled, protected, routes}` 항목으로 추가하고 인증 여부와 노출 여부를 한곳에서 관리한다.
- 모바일 화면은 `flownote-mobile/app/`, 공통 API 계약은 `flownote-mobile/lib/flownote-api.ts`에서 시작해 추적한다.

## 실행과 배포

- 로컬/내부망: `docker compose up -d --build`
- 웹 production: Vercel `flownote-react`
- 백엔드와 모바일 웹 테스트: Railway production의 `flownote-api`, `flownote-main`, `flownote-canvas`, `flownote-serve`, `flownote-ai`, `flownote-mobile-production`
- 표준 검증: `scripts/verify-services.sh`
- 표준 배포: `scripts/deploy-production.sh`
- 세부 절차와 롤백: `docs/DEPLOYMENT.md`

## 변경 규칙

- 새 도메인은 API 계약, 저장소 모델, 웹·모바일 호출부를 같은 이름으로 추적할 수 있게 한다.
- DB 마이그레이션은 순서를 유지하고 기존 데이터와 호환되게 작성한다.
- 서비스 URL, 포트, 환경 변수 변경은 `docker-compose.yml`, `.env.example`, `docs/DEPLOYMENT.md`를 함께 확인한다.
- 외부 클라이언트 계약은 직접 서비스 URL이 아니라 게이트웨이 경로를 기준으로 한다.
