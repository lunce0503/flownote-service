# Flownote 아키텍처

이 문서는 저장소 전체 구조와 작업 기록 위치를 한눈에 확인하기 위한 루트 아키텍처 문서다. 세부 운영 규칙은 `AGENTS.md`, 장기 문서는 `docs/`, 에이전트 실행 자산은 `.codex/`를 기준으로 한다.

## 하위 프로젝트

| 경로 | 역할 | 주요 책임 |
| --- | --- | --- |
| `flownote/` | Vite React 웹 앱 | 작업, 노트, 캔버스, 소셜, 주식 등 주요 사용자 화면 |
| `flownote-next/` | Next.js 앱 | Next app-router 기반 화면, API, Prisma/PostgreSQL 기능 |
| `flownote-API/` | FastAPI 서비스 | AI/에이전트 보조 API, 외부 Python 생태계 연동 |
| `flownote-server/` | Spring Boot WAS | 인증, 사용자 소유 데이터, 작업/노트/모바일 설정 API |
| `flownote-mobile/` | Expo 모바일 앱 | Spring WAS 설정을 읽어 WebView로 웹 앱을 여는 모바일 진입점 |
| `docker-compose.yml` | 로컬 통합 실행 | PostgreSQL과 모든 앱/서버를 함께 실행 |

## 서비스 경계

- 사용자 인증과 사용자 소유 데이터의 기준은 `flownote-server`다.
- React 웹 앱은 `VITE_CORE_API_URL`로 Spring API를 호출하고, `VITE_AI_BASE_URL` 또는 `VITE_API_BASE_URL`로 FastAPI 기능을 호출한다.
- Next.js 앱은 Prisma/PostgreSQL을 사용하는 독립 흐름을 담당하되, 공통 DB 계약이 바뀌면 Spring과 함께 확인한다.
- 모바일 앱은 `EXPO_PUBLIC_WAS_URL`의 `/api/mobile/config`를 시작점으로 사용한다.
- DB 스키마 기준은 Spring Flyway 마이그레이션이며, 문서가 실제 마이그레이션과 다르면 마이그레이션을 우선한다.

## 코드 처리 단계

1. 요청을 하위 프로젝트와 파일에 매핑한다.
2. 주변 타입, API 응답 형태, 환경 변수, 호출부를 먼저 읽는다.
3. 기존 로컬 패턴에 맞춰 가장 좁은 변경을 적용한다.
4. 사용자에게 보이는 흐름은 로딩, 빈 상태, 오류 상태를 함께 고려한다.
5. 변경한 하위 프로젝트의 가장 작은 검증 명령을 실행한다.
6. 작업 종료 전 루트에서 `docker compose up -d --build`로 통합 실행을 확인한다.

## 기록 위치

| 경로 | 용도 | 기록 기준 |
| --- | --- | --- |
| `logs/bugs/` | 재현 가능한 런타임 오류와 사용자 제보 버그 | 증상, 재현 경로, 원인, 수정 방향 |
| `logs/` | 실행 로그 요약과 운영 증상 | 비밀값을 제거한 핵심 로그와 관찰 결과 |
| `report/` | 리뷰, 감사, 배포 결과, 큰 작업 요약 | 다시 읽을 가치가 있는 분석 산출물 |
| `.codex/memories/` | 안정적인 프로젝트 컨벤션 후보 | 반복 적용할 수 있는 장기 지식 |
| `docs/` | 제품, 설계, 품질, 보안, 신뢰성 문서 | 코드와 운영 기준을 설명하는 장기 문서 |

`logs/`와 `report/`는 소스 코드의 근거를 대체하지 않는다. 코드와 문서가 충돌하면 소스 코드, 마이그레이션, 실행 가능한 검증 결과를 우선한다.

## 검증 기준

- `flownote/`: `yarn build`
- `flownote-next/`: `yarn lint`, `yarn build`
- `flownote-API/`: `uv run ...`
- `flownote-server/`: `./gradlew test`
- 루트 통합: `docker compose up -d --build`

검증 실패는 실패한 명령, 핵심 오류, 영향 범위, 다음 조치를 함께 기록한다.
