# Flownote 시스템 설계

## 아키텍처 지도

Flownote는 로컬 통합 실행을 기준으로 여러 하위 프로젝트가 함께 동작한다.

| 하위 프로젝트 | 역할 | 주요 기술 |
| --- | --- | --- |
| `flownote/` | 주요 Vite React 웹 앱 | React 19, Tailwind, BlockNote, 캔버스, SSE |
| `flownote-next/` | Next.js 앱과 일부 API/업로드 흐름 | Next.js 16, Prisma, PostgreSQL |
| `flownote-server/` | 인증, 작업, 노트, 소셜, 주식, 모바일 설정 WAS | Java 17, Spring Boot, JDBC, Flyway |
| `flownote-API/` | AI/에이전트 + MCP 도구, 캔버스 Socket.IO 실시간, Yahoo Finance 시장 데이터 | FastAPI, uv, python-socketio, yfinance, Google GenAI |
| `flownote-mobile/` | Expo WebView 모바일 앱 | Expo, React Native WebView |
| `docker-compose.yml` | 로컬 통합 오케스트레이션 | PostgreSQL, Spring, FastAPI, React, Next, Expo |

## 서비스 경계

- 인증과 사용자 소유 데이터의 기준 API는 `flownote-server`다.
- AI/시장 데이터처럼 Python 생태계 의존성이 필요한 기능은 `flownote-API`에 둔다.
- React 웹 앱은 사용자 경험의 중심이며 Spring/ FastAPI API를 호출한다.
- Next.js 앱은 독립된 앱 라우터 기능과 업로드/Prisma 기반 기능을 담당한다.
- 모바일 앱은 Spring WAS의 `/api/mobile/config`를 시작점으로 삼고 웹 URL을 WebView로 연다.
- 캔버스 실시간 협업은 `flownote-API`의 Socket.IO가 담당한다. 발신자는 `canvas:join`(코어 권한 검증을 거치는 유일한 경로)으로 룸에 참여한 뒤에만 `canvas:line-*` 이벤트를 브로드캐스트할 수 있고, 미참여 발신자는 `canvas_socket._require_room_membership`에서 403으로 거부된다.
- `flownote-API`의 MCP 도구(note/task/schedule)는 Spring 코어를 `core_api.forward_request_async`(= `asyncio.to_thread`)로 호출한다. 동기 프록시를 스레드로 넘겨 같은 프로세스의 캔버스 실시간 이벤트 루프가 코어 왕복에 막히지 않게 한다.

## 데이터 소유권

- PostgreSQL 스키마 변경은 `flownote-server/src/main/resources/db/migration/`의 Flyway 마이그레이션을 기준으로 한다.
- DB 문서는 `docs/generated/db-schema.md`에 정리하되 실제 마이그레이션과 불일치하면 마이그레이션을 우선한다.
- 사용자별 데이터는 `user_id`를 기준으로 격리한다.
- 업로드 파일, DB 덤프, 로컬 인증 정보는 문서나 Git 추적 대상에 넣지 않는다.

## 역량 조합 지점 (프론트 라우팅)

- 웹 라우트 조합의 단일 등록 지점은 `flownote/src/app/capabilityManifest.tsx`다. `App.tsx`는 이 매니페스트를 순회해 라우트를 생성하며, 수동 `<Route>` 나열은 쓰지 않는다.
- 새 역량 추가 = 매니페스트 배열에 `{id, label, nav, enabled, protected, routes}` 항목 하나를 더하는 것. 역량의 조합·분리는 `enabled` 플래그로 토글하고, 로그인 필요 여부는 `protected`로 일괄 지정한다.
- 홈 대시보드·모바일 탭도 같은 매니페스트를 소비하도록 확장하는 것이 목표다(현재 웹 라우팅에 우선 적용).

## 에이전트용 설계 규칙

- 새 도메인은 API 계약, 저장소 모델, UI 호출부를 함께 추적할 수 있게 이름을 맞춘다.
- 경계에서 들어오는 데이터는 서버에서 검증하고, 프론트에서는 사용자에게 빠른 피드백을 제공한다.
- DB 마이그레이션은 순서를 유지하고 기존 데이터와 호환되게 작성한다.
- 서비스 간 호출 URL, 포트, 환경 변수 변경은 `docker-compose.yml`과 관련 문서를 함께 확인한다.

## 검증

- Vite UI 변경: `cd flownote && yarn build`
- Spring 변경: `cd flownote-server && ./gradlew test`
- FastAPI 변경: `cd flownote-API && uv run ...`
- Next.js 변경: `cd flownote-next && yarn lint && yarn build`
- 통합 확인: 저장소 루트에서 `docker compose up -d --build`
