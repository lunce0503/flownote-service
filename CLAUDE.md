# Flownote 에이전트 지침

## 프로젝트 구성

- `flownote/`: Vite React 앱. React 19, BlockNote, Mantine, Tailwind, PDF 렌더링, Markdown/수식 렌더링을 사용한다.
- `flownote-next/`: Next.js 16 앱. React 19, Prisma, PostgreSQL, Tailwind, app-router API를 사용한다.
- `flownote-API/`: Python FastAPI 서비스. `uv`, SQLModel, asyncpg, Google GenAI, MCP 서버, 환경 변수 기반 설정을 사용한다.
- `flownote-server/`: Java 17 Spring Boot 서비스. Gradle, JDBC, Flyway, validation, actuator, PostgreSQL을 사용한다.
- `docker-compose.yml`: 로컬 통합 실행 기준이다.
- `report/`: 리뷰와 분석 산출물이다. 소스 코드와 충돌하면 소스 코드를 기준으로 판단한다.
- `logs/`: 버그 재현, 실행 로그 요약, 운영 증상, 원인 분석 기록을 둔다. 비밀값과 원본 업로드 파일은 넣지 않는다.

## 작업 규칙

### 1. 파악
### 2. 코드 처리
### 3. 빌드
### 4. 테스트
### 5. 기록
### 6. 피드백

- 코드를 수정하기 전에 영향을 받는 하위 프로젝트를 먼저 식별한다.
- 새 아키텍처를 만들기보다 기존 로컬 패턴을 우선 따른다.
- 변경 범위는 사용자 요청에 맞게 좁게 유지하고, 관련 없는 리팩터링은 하지 않는다.
- 코드 처리 단계에서는 주변 타입, API 응답 형태, 환경 변수, 호출부를 확인한 뒤 수정한다.
- 런타임 오류나 재현 가능한 버그는 `logs/bugs/`에 증상, 원인, 수정 방향을 남긴다.
- 리뷰, 감사, 배포 결과, 큰 작업 요약은 `report/`에 남긴다.
- `report/` 보고서 파일명은 `YYYY-MM-DD-HHMM-수정한내용.md` 형식으로 고정한다. 시간은 24시간제 로컬 시각, 내용 부분은 케밥 케이스로 쓴다. 예: `2026-07-02-1206-canvas-socket-auth.md`.
- `.env`, `.env.local`, DB 덤프, 업로드 파일, 로컬 인증 정보의 비밀값을 노출하지 않는다.
- 명시 요청이 없으면 `node_modules/`, `.next/`, `dist/`, `.venv/`, `build/`, 업로드 자산 같은 생성물이나 대용량 폴더를 수정하지 않는다.
- 사용자가 설계, 리뷰, 분석만 요청하면 파일을 수정하지 않는다.
- 의미 있는 수정을 하기 전에는 주변 코드와 의존성 스크립트를 확인한다.
- 수정 후에는 가능하면 해당 하위 프로젝트에 맞는 가장 작은 유효성 검증 명령을 실행한다.
- 모든 작업이 끝나면 저장소 루트에서 `docker compose up -d --build`를 실행해 통합 Docker 빌드와 백그라운드 실행을 검증한다.
- 파일을 수정한 작업은 Docker 검증 뒤 항상 클라우드 배포까지 진행한다. `flownote/` 변경은 Vercel production 배포를, `flownote-API/` 변경은 Railway `flownote-api` 배포를, `flownote-server/` 변경은 Railway `flownote-main` 배포를 실행한다. 여러 하위 프로젝트가 바뀌면 해당 배포를 모두 수행한다.
- 단, `report/` 아래 보고서만 작성하거나 수정하는 작업은 Docker 빌드와 클라우드 배포를 진행하지 않는다. 이 경우 파일 존재, 주요 내용 확인 같은 문서 검증만 수행하고 배포 생략 사유를 최종 응답에 남긴다.
- `report/` 외 문서만 수정한 경우에는 Vercel production 배포와 영향받는 Railway 서비스 배포 여부를 확인한다. 클라우드에 반영할 실행 산출물이 없는 문서 전용 변경이면 Vercel production 배포를 기본으로 수행하고, 백엔드 배포 생략 사유를 기록한다.
- 검증 실패는 실행한 명령, 핵심 실패 이유, 다음 조치를 함께 보고한다.
- Docker 빌드를 실행하지 못한 경우에도 실행하지 못한 이유와 다음 조치를 최종 응답에 남긴다.
- 클라우드 배포를 실행하지 못한 경우에도 실행하지 못한 이유, 필요한 배포 명령, 다음 조치를 최종 응답에 남긴다.
- 사용자의 기존 변경이나 관련 없는 로컬 작업을 되돌리지 않는다.

## 하위 프로젝트 명령

- `flownote/`: 프로덕션 빌드 검증은 `yarn build`를 사용한다. 브라우저나 개발 서버 확인이 필요할 때만 `yarn dev`를 사용한다.
- `flownote-next/`: 린트는 `yarn lint`, 프로덕션 검증은 `yarn build`를 사용한다.
- `flownote-API/`: `flownote-API/` 내부에서 `uv run ...` 명령을 사용한다. 프로젝트 로컬 가상환경과 `uv.lock`을 우선한다.
- `flownote-server/`: `flownote-server/` 내부에서 `./gradlew test`를 사용한다.
- 통합 작업: 포트, 환경 변수, 볼륨, DB 가정을 바꾸기 전 `docker-compose.yml`을 확인하고 서비스 경계를 검증한다.

## 하네스 자산

- 프로젝트 하네스 개요: `.codex/README.md`
- 공통 및 스택별 규칙: `.codex/rules/`
- 재사용 작업 프롬프트: `.codex/prompts/`
- 품질 체크리스트: `.codex/checklists/`
- 장기 프로젝트 메모리 후보: `.codex/memories/`
- 하네스 워크플로우와 라우팅: `.codex/harness/`

## 기본 워크플로우

1. 파악: 요청을 관련 하위 프로젝트와 파일에 매핑한다.
2. 계획: 최소 구현 경로와 검증 경로를 정한다.
3. 구현: 기존 컨벤션을 사용해 집중된 변경만 수행한다.
4. 검증: 변경에 맞는 lint, build, test, targeted check를 실행한다.
5. 리뷰: 회귀, 보안, API 계약, UI 동작을 확인한다.
6. 기록: 버그와 실행 로그는 `logs/`, 분석 산출물과 작업 결과는 `report/`, 재사용 가능한 프로젝트 컨벤션은 `.codex/memories/`에 남긴다.
7. Docker 빌드 및 실행: 작업 종료 전 저장소 루트에서 `docker compose up -d --build`를 실행해 통합 빌드와 백그라운드 실행을 확인한다.
8. 클라우드 배포: 파일을 수정한 작업은 Docker 검증 뒤 Vercel production 및 영향받는 Railway 서비스를 배포하고 URL, deployment id, 헬스체크 결과를 확인한다. `report/` 전용 보고서 작성/수정은 Docker와 클라우드 배포를 생략한다.
9. 보고: 최종 응답에는 하위 프로젝트 검증 결과, `docker compose up -d --build` 결과, 클라우드 배포 결과를 함께 포함한다.

## 리뷰 관점

- 버그, 회귀, 보안 이슈, 누락된 검증, 깨진 계약을 먼저 제시한다.
- 가능하면 파일과 줄 번호를 함께 제시한다.
- 환경 변수 처리, 업로드, 인증, SQL, 외부 API, MCP 도구는 보안 민감 영역으로 본다.
- UI 작업에서는 반응형 레이아웃, 텍스트 넘침, 시각적 겹침, 접근성, 기존 디자인 시스템 일관성을 확인한다.
