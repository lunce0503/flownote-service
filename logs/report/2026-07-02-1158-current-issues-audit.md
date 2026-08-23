# 현재 문제점 진단 및 개선 방안 보고서

작성일: 2026-07-02
대상 브랜치: `chore/backend-mobile-deploy-prep`

## 요약

배포 준비 브랜치를 기준으로 저장소 전체를 점검한 결과, **git에 커밋되지 않은 신규 소스 파일을 추적 중인 코드가 참조하고 있어 git 소스 기준 원격 빌드(Vercel git 연동, CI)가 3개 하위 프로젝트 모두 깨지는 상태**가 가장 시급한 문제다. 그 외에 이벤트 루프 블로킹, 노트 목록 R2 동기 읽기, 캔버스 소켓 브로드캐스트 인증 부재, lint/테스트 게이트 고장을 확인했다.

로컬 검증 결과: `flownote` yarn build 성공, `flownote-server` gradlew test 성공, `flownote-API` import 성공(테스트는 실행 불가), `flownote-next` yarn lint 실패.

---

## 1. 치명적: 커밋 누락으로 git 기준 빌드 전면 파손

추적 중인(tracked) 파일이 아직 untracked 상태인 신규 파일을 import/참조한다. 로컬 Docker 빌드는 작업 디렉터리를 COPY하므로 통과하지만, **git 소스를 사용하는 모든 빌드(Vercel git 연동, CI, 다른 개발자의 clone)는 즉시 실패**한다.

| 하위 프로젝트 | 추적 중인 참조 파일 | untracked 신규 파일 |
| --- | --- | --- |
| flownote-API | `app/main.py:12` (`from app.canvas_socket import …`) | `app/canvas_socket.py`, `tests/` |
| flownote-server | `canvas/CanvasController.java`, `canvas/CanvasService.java` | `CanvasAdminController.java`, `CanvasOperationScheduler.java`, `CanvasStorageOutboxService.java`, `CanvasStorageOutboxWorker.java`, `CanvasMutationHasher.java`, `CanvasDiagnosticsService.java`, `CanvasDiagnosticsRetentionJob.java` 등 8개 + 테스트 |
| flownote-server (DB) | `NoteService.java` 등이 `notes.revision` 컬럼 사용 | Flyway `V18__canvas_mutation_ledger.sql`, `V19__canvas_resilience_and_admin_diagnostics.sql`, `V20__note_revisions.sql` |
| flownote (웹) | `app/App.tsx`, `features/canvas/model/usePersistence.tsx`, `canvasSelectionModel.ts`, `useDrawing.tsx` | `app/routers/AdminCanvas/`, `canvasDraftWorker.ts`, `canvasIndexedDb.ts`, `canvasSpatialIndex.ts`, `widgets/CanvasWidget/InfiniteCanvas/ui/Canvas.tsx` |

특히 마이그레이션 V18~V20이 빠지면 코드는 배포되어도 `revision`, `last_client_id` 컬럼과 mutation ledger 테이블이 없어 노트 저장·캔버스 저장이 전부 SQL 오류로 실패한다.

**개선 방안**: 위 파일들을 즉시 `git add` 후 커밋한다. 재발 방지로 배포 전 체크리스트에 `git status --porcelain | grep '??'` 확인(또는 pre-push 훅)을 추가한다.

## 2. 심각: 빌드 산출물이 git에 추적됨 + .gitignore 불일치

- `flownote-server/build/**`, `flownote-server/.gradle/**` 아래 **71개 파일(.class 바이너리, 실행 히스토리 캐시)이 git에 추적**되고 있다. 컴파일할 때마다 바이너리 diff가 쌓이고, 이번 브랜치 상태(git status)의 대부분이 이 노이즈다. 커밋 리뷰가 사실상 불가능해진다.
- 루트 `.gitignore`가 `docs/`, `AGENTS.md`, `GEMINI.md`를 ignore하지만 이 파일들은 이미 추적 중이라 ignore가 효력이 없고, 수정 사항이 계속 status에 나타난다. 의도(추적 유지 vs 제외)가 불명확하다.

**개선 방안**:
1. `.gitignore`에 `flownote-server/build/`, `flownote-server/.gradle/` 추가.
2. `git rm -r --cached flownote-server/build flownote-server/.gradle`로 인덱스에서만 제거 후 커밋.
3. `docs/`, `AGENTS.md`, `GEMINI.md`는 추적 유지가 의도라면 `.gitignore`에서 제거, 제외가 의도라면 동일하게 `--cached` 제거.

## 3. 심각: FastAPI 이벤트 루프 블로킹 (캔버스 실시간까지 정지)

`flownote-API/mcpServers/note_tools.py:36-64`의 `add_note`는 `async def`인데 동기 `urllib` 기반 `forward_request`(타임아웃 35초)를 직접 호출한다. 이번 브랜치에서 revision 조회용 `GET /api/notes` 호출이 추가되어 **한 번의 노트 저장에 최대 약 70초까지 이벤트 루프 전체가 블로킹**될 수 있다.

이 도구들은 `app/services/agent_service.py`를 통해 FastAPI 프로세스 안에서 실행되고, 같은 프로세스에 이제 캔버스 Socket.IO 서버(`app/main.py:39-40`)가 올라가 있다. 즉 에이전트가 노트를 저장하는 동안 **모든 사용자의 캔버스 드로잉 동기화, 저장, 로드가 함께 멈춘다**. `canvas_socket.py`는 `asyncio.to_thread`/httpx로 이 문제를 회피하고 있으나 `note_tools.py`(및 task/schedule 도구)는 그렇지 않다.

**개선 방안**: MCP 도구의 `forward_request` 호출을 `await asyncio.to_thread(forward_request, …)`로 감싸거나, `canvas_socket.py`의 `_forward_json` 패턴을 공용 유틸로 승격해 재사용한다.

## 4. 심각: 노트 목록 조회가 노트 수만큼 R2를 동기 호출

`NoteService.java:40-48`(list)과 `mapNote`(`NoteService.java:180-192`)는 `content_object_key`가 있는 노트마다 `assetStorage.readJson()`으로 R2 객체를 **행 단위 동기 읽기**한다. 노트가 N개면 `GET /api/notes` 한 번에 R2 GET N회가 순차 실행된다.

- 모바일 Workspace 목록, 웹 목록 로딩이 노트 수에 비례해 느려진다.
- MCP `add_note`는 revision 숫자 하나를 얻으려고 이 전체 목록(모든 노트 본문 포함)을 호출한다 (`note_tools.py:39-45`). 비용이 매우 크고, 조회~저장 사이 race로 409 충돌도 발생 가능하다.

**개선 방안**:
1. 목록 API는 본문 제외 메타데이터(제목, 시각, revision)만 반환하는 형태로 분리한다 (`GET /api/notes?fields=meta` 또는 목록 쿼리에서 content 로드 생략).
2. 단건 조회 `GET /api/notes/{id}`를 추가하고 MCP `add_note`는 그것만 호출한다.
3. 근본적으로는 서버 upsert가 이미 `revision > notes.revision` 조건과 409를 처리하므로, 클라이언트 revision 선조회 대신 "서버가 현재 revision+1을 할당"하는 옵션도 검토한다.

## 5. 보안: 캔버스 소켓 라인 이벤트에 인증·멤버십 검증 없음

`app/canvas_socket.py`에서 `connect`는 무조건 `True`를 반환하고(283-285행), `canvas:join`은 core API 메타데이터 조회로 권한을 확인하지만, **`canvas:line-start`·`canvas:line-points`·`canvas:line-end`(428-485행)는 인증 헤더 검증도, 발신자가 해당 룸에 join했는지 확인도 없이 임의 `canvasId` 룸으로 브로드캐스트**한다. 인증 없는 클라이언트가 다른 사용자의 캔버스 화면에 임의의 선 데이터를 주입하거나 노이즈를 흘릴 수 있다.

**개선 방안**: 라인 이벤트 처리 시 `sio.rooms(sid)`에 `canvas:{canvasId}` 룸이 포함되어 있는지 확인하고, 미가입이면 거부한다. join 시점에 검증된 권한을 세션(`sio.save_session`)에 저장해 재사용하면 매 이벤트 core 호출 없이 처리할 수 있다.

## 6. 배포 구성 충돌: flownote-API의 Vercel 설정과 Socket.IO 비호환

커밋 `1b303b4`가 `flownote-API/vercel.json`(experimentalServices, fastapi 엔트리포인트)을 추가했지만, 이 브랜치에서 같은 앱에 Socket.IO가 결합됐다. Vercel Functions는 **WebSocket 연결을 지원하지 않고**, engine.io 세션과 룸 상태(`CanvasLoadTaskRegistry` 포함)는 인메모리라 서버리스 다중 인스턴스에서 동작하지 않는다. Vercel로 배포하면 캔버스 실시간 기능이 통째로 깨진다. CLAUDE.md 기준 flownote-API의 배포 대상은 Railway(`railway.json` 존재)다.

**개선 방안**: flownote-API는 Railway 단일 배포로 유지하고 `vercel.json`을 제거하거나, Vercel 배포가 필요하면 Socket.IO 부분을 Railway 상시 프로세스로 분리한다. 웹 앱의 `VITE_CANVAS_SOCKET_URL`이 프로덕션 빌드(Vercel 환경 변수)에 설정되어 있는지도 확인해야 한다 — 미설정 시 `usePersistence.tsx:719` 폴백으로 Socket.IO가 없는 Spring 서버(8080)에 접속을 시도해 실시간 동기화가 조용히 실패한다.

## 7. 품질 게이트 고장

- **flownote-next `yarn lint` 실패(에러 20, 경고 1,745)**: `eslint.config.mjs`가 eslint-config-next 기본 ignore를 override하면서 `.vercel/**`을 빠뜨려, `.vercel/output`의 생성 코드가 lint 대상이 됐다. 실제 소스 문제가 아니라 게이트 자체가 깨진 상태라, 진짜 회귀가 생겨도 묻힌다.
  - 개선: `globalIgnores`에 `.vercel/**` 추가.
- **flownote-API 테스트 실행 불가**: `tests/test_canvas_socket.py`가 존재하지만 (1) `pytest`가 의존성에 없고, (2) `tests/`에서 `app` 패키지를 import하지 못한다(`ModuleNotFoundError: No module named 'app'`).
  - 개선: `[dependency-groups] dev = ["pytest", "pytest-asyncio"]` 추가, `pyproject.toml`에 `[tool.pytest.ini_options] pythonpath = ["."]` 설정.
- **Dockerfile이 uv.lock을 무시**: `flownote-API/Dockerfile`이 `uv pip install -r pyproject.toml`로 설치해 lock 파일이 빌드에 반영되지 않는다. 로컬과 배포 이미지의 의존성 버전이 어긋날 수 있다.
  - 개선: `uv sync --frozen --no-dev` 기반 설치로 교체.

## 8. 중간: 모바일 노트 revision 충돌 후 복구 경로 없음

서버는 낮거나 같은 revision 저장을 409(`"더 최신인 노트가 이미 저장되었습니다."`)로 거부한다(`NoteService.java:84-114`). 모바일 `saveSelectedNote`(`explore.tsx:250-270`)는 실패 시 Alert만 띄우고 로컬 `selectedNote.revision`을 갱신하지 않으므로, 다른 기기에서 먼저 저장된 뒤에는 **수동으로 당겨서 새로고침하기 전까지 저장이 계속 실패**한다.

**개선 방안**: 409 수신 시 해당 노트를 재조회해 최신 revision·본문을 반영하고, "다른 기기에서 수정됨 — 새로고침 후 다시 시도" 안내와 함께 편집 내용을 보존한다.

## 9. 사소

- `canvas_socket.py:331-332`: gather 결과 unpack이 `isinstance(x, Exception)`만 검사한다. `CancelledError`는 `BaseException`이라 이 분기를 통과해 튜플 unpack `TypeError`가 날 수 있는 이론적 경로가 있다(과거 `logs/bugs/canvas-load-queue-baseexception-2026-06-08.md`와 동일 계열). `isinstance(x, BaseException)`으로 넓히는 것이 안전하다.
- `flownote-API/mcp_servers/`와 `mcpServers/` 디렉터리가 공존한다. `mcp_servers/planner_mcp.py`가 사용 중이 아니면 한쪽으로 통합한다.
- 저장소 루트에 stray 파일: `package.json`(wrangler만 포함), `package-lock.json`, `architecture-diagram.html`, `.antigravitycli/`. 필요 여부를 정리하고 불필요하면 삭제 또는 gitignore 처리한다.
- Next.js sync SSE(`sync-events.ts`)는 인메모리 `Map` 기반이라 서버리스 다중 인스턴스 환경에서는 publish와 구독이 다른 인스턴스에 떨어지면 이벤트가 유실된다. 현재 단일 인스턴스/로컬에서는 동작하지만, 트래픽 증가 시 Redis pub/sub 등 외부 브로커로 이전이 필요하다.

---

## 검증 결과

- `flownote-API`: `uv run python -c "import app.main"` 성공. `uv run pytest tests`는 pytest 미설치 및 `app` 모듈 import 실패로 실행 불가(7절 참조).
- `flownote-next`: `yarn lint` 실패 — `.vercel/output` 생성물 lint 포함(7절 참조).
- `flownote`: `yarn build` 성공(15.4초, 청크 크기 경고만 존재).
- `flownote-server`: `./gradlew test` 성공(exit 0).

## 우선순위 제안

1. (즉시) 1번 커밋 누락 해소 — 배포 브랜치 푸시 전 필수.
2. (즉시) 2번 build/.gradle 추적 제거 — 리뷰 가능성 회복.
3. (이번 주) 3번 이벤트 루프 블로킹, 5번 소켓 인증, 7번 게이트 복구.
4. (다음 사이클) 4번 목록 R2 읽기 구조 개선, 6번 배포 대상 정리, 8번 모바일 충돌 복구.

## 배포 생략 사유

이번 작업은 `report/` 아래 보고서 작성만 수행했고 소스 코드를 수정하지 않았다. CLAUDE.md 규칙에 따라 Docker 통합 빌드와 클라우드 배포(Vercel/Railway)는 생략한다.
