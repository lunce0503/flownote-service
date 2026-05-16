# Flownote System Design

## Architecture Map

Flownote는 로컬 통합 실행을 기준으로 여러 하위 프로젝트가 함께 동작한다.

| 하위 프로젝트 | 역할 | 주요 기술 |
| --- | --- | --- |
| `flownote/` | 주요 Vite React 웹 앱 | React 19, Tailwind, BlockNote, canvas, SSE |
| `flownote-next/` | Next.js 앱과 일부 API/업로드 흐름 | Next.js 16, Prisma, PostgreSQL |
| `flownote-server/` | 인증, 작업, 노트, 소셜, 주식, 모바일 설정 WAS | Java 17, Spring Boot, JDBC, Flyway |
| `flownote-API/` | AI/agent 보조 API와 Yahoo Finance market data | FastAPI, uv, yfinance, Google GenAI |
| `flownote-mobile/` | Expo WebView 모바일 앱 | Expo, React Native WebView |
| `docker-compose.yml` | 로컬 통합 오케스트레이션 | PostgreSQL, Spring, FastAPI, React, Next, Expo |

## Boundaries

- 인증과 사용자 소유 데이터의 기준 API는 `flownote-server`다.
- AI/market data처럼 Python 생태계 의존성이 필요한 기능은 `flownote-API`에 둔다.
- React 웹 앱은 사용자 경험의 중심이며 Spring/ FastAPI API를 호출한다.
- Next.js 앱은 독립된 app-router 기능과 업로드/Prisma 기반 기능을 담당한다.
- 모바일 앱은 Spring WAS의 `/api/mobile/config`를 시작점으로 삼고 웹 URL을 WebView로 연다.

## Data Ownership

- PostgreSQL 스키마 변경은 `flownote-server/src/main/resources/db/migration/`의 Flyway migration을 기준으로 한다.
- DB 문서는 `docs/generated/db-schema.md`에 정리하되 실제 migration과 불일치하면 migration을 우선한다.
- 사용자별 데이터는 `user_id`를 기준으로 격리한다.
- 업로드 파일, DB 덤프, 로컬 인증 정보는 문서나 Git 추적 대상에 넣지 않는다.

## Agent-Readable Design Rules

- 새 도메인은 API 계약, 저장소 모델, UI 호출부를 함께 추적할 수 있게 이름을 맞춘다.
- 경계에서 들어오는 데이터는 서버에서 검증하고, 프론트에서는 사용자에게 빠른 피드백을 제공한다.
- DB migration은 순서를 유지하고 기존 데이터와 호환되게 작성한다.
- 서비스 간 호출 URL, 포트, 환경 변수 변경은 `docker-compose.yml`과 관련 문서를 함께 확인한다.

## Verification

- Vite UI 변경: `cd flownote && yarn build`
- Spring 변경: `cd flownote-server && ./gradlew test`
- FastAPI 변경: `cd flownote-API && uv run ...`
- Next.js 변경: `cd flownote-next && yarn lint && yarn build`
- 통합 확인: 저장소 루트에서 `docker compose up -d --build`
