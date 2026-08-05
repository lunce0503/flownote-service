# 개요

Flownote는 캔버스와 텍스트 노트를 중심으로 일정, 작업, 주식, 소셜, 채팅, AI 기능을 결합한 멀티 서비스 노트 애플리케이션이다. 이 문서는 저장소를 탐색할 때 사용하는 코드맵이며, 서비스 경계는 `docker-compose.yml`, HTTP 라우팅은 `flownote-API/app/gateway.py`, DB 스키마는 `flownote-server/src/main/resources/db/migration/`을 우선 기준으로 삼는다.

현재 코드 기준은 `main` 브랜치의 `cdc3528`(2026-07-28, 종료된 `flownote-next` 제거) 이후 작업 트리다. 런타임 상태나 배포 ID처럼 자주 변하는 정보는 `logs/report/`에 기록하고, 이 문서에는 코드와 함께 유지되는 구조만 기록한다.

# 시스템 구성 (조감도)

```text
Browser (flownote/)              Mobile (flownote-mobile/)
  | HTTP/SSE + Bearer              | /api/mobile/config + Web/API
  +------------------+-------------+
                     v
          flownote-API (FastAPI gateway, :8000)
          | Socket.IO canvas       | path-based HTTP proxy
          |                        +--> flownote-server (Spring, :8080)
          |                        |      auth, users, mobile config, Flyway
          |                        +--> flownote-canvas (Go, :8090)
          +----------------------->|      canvas, notes, uploads
                                   +--> flownote-serve (Go, :8095)
                                   |      diary, schedules, tasks, stocks, social, chat
                                   +--> flownote-ai (FastAPI, internal :8000 / host :8010)
                                          agent, agent-note, market
                                             |
                                             +--> Ollama (:11434, internal only)

Backends --> PostgreSQL (system of record)
Backends --> Redis (session/socket/market cache)
Go services --> S3-compatible object storage (large payloads and assets)
```

브라우저의 일반 API 기본 진입점은 FastAPI 게이트웨이다. 캔버스 HTTP는 환경 설정에 따라 Go 서버를 직접 호출할 수 있고, 캔버스 실시간 저장·로드와 라인 스트림은 FastAPI의 Socket.IO를 거쳐 Go 서버로 전달된다.

Flownote는 기획한 내용을 바탕으로 관련 필기를 텍스트와 그림으로 표현하여 새로운 아이디어를 만들거나 기존의 내용을 정리하며 지식을 정리하게 돕는 노트이다. 주된 기능은 그림판(Canvas)과 작성 영역(Text Pad)이며 부가적인 기능을 이용하여 그림판과 작성영역과의 유기적인 조합을 이루는 방식으로 개발되었다.

그림판은 연필이나 펜을 통해 작성하는 방식을 말하며 이는 고전적인 필기를 중심으로 작성되는 기능이다. 이 기능을 주요 작성 방법으로 정하면 대상의 연결성과 높은 직관력을 가지는 시각적 표현의 장점을 이용하는 곳으로 주로 구상이나 이해를 중시할 때 작성되는 방식이다. 

작성 영역은 키보드와 같은 타이핑 기기를 통해 작성되는 기능을 말하며, 이를 주된 작성법으로 정하면 엄밀하게 정의되어야 하거나 정보의 오류가 없어야 하는 내용을 담는 것이 주된 내용이 된다. 그리고 그림판 기능과 달리 단방향으로 작성하기 때문에 시간을 기반으로 하는 정보를 작성하는데 용이하다. 

위의 주된 기능을 바탕으로 작성하는 내용을 기록하는데 불편함을 겪는 경우에 이용하는 것이 부가적인 기능이다. 텍스트나 선 데이터를 가지고 표현하기 어려운 경우, 사용자가 해당되는 지식을 나타내는 것이 어려운 경우나 실시간으로 변하는 값을 이용하는 경우와 같이 어려움을 갖는 경우에 사용하는 기능이다. 

# Code map

| 경로 | 실행 단위 | 시작점 | 책임 |
| --- | --- | --- | --- |
| `flownote/` | Vite React SPA | `src/main.tsx`, `src/app/App.tsx`, `src/app/capabilityManifest.tsx` | 웹 화면, FSD 상태/기능 조합, REST/SSE/Socket.IO 클라이언트 |
| `flownote-mobile/` | Expo React Native | `app/_layout.tsx`, `app/(tabs)/_layout.tsx` | iOS/Android 셸, 모바일 API/WebView 진입 |
| `flownote-API/` | FastAPI + Socket.IO | `app/main.py` | 공개 API 게이트웨이, 캔버스 실시간 허브, 요청 추적/콜드스타트 연결 재시도 |
| `flownote-server/` | Spring Boot | `FlownoteServerApplication.java` | 인증·사용자·모바일 설정, 전체 PostgreSQL Flyway 스키마 소유 |
| `flownote-canvas/` | Go HTTP 서버 | `main.go` | 캔버스, 노트, 폴더, 업로드, 캔버스 관리자 진단 |
| `flownote-serve/` | Go HTTP 서버 | `main.go` | 일기, 일정, 작업, 주식, 소셜, 채팅 |
| `flownote-ai/` | FastAPI | `app/main.py` | AI 스트림, 에이전트 노트 검색, 시장 데이터, Ollama 연동 |
| `docker-compose.yml` | 로컬 통합 오케스트레이션 | Compose 서비스 정의 | Postgres, Redis, 5개 백엔드, 웹, 모바일, Ollama 네트워크 구성 |
| `docs/`, `logs/` | 지식/운영 기록 | `docs/README.md`, `logs/report/` | 설계 기준, 제품 사양, 분석·배포 결과 |

## 현재 작업 트리 변경 코드맵 (2026-08-05)

Git 추적 변경은 `ARCHITECTURE.md`와 아래 두 `flownote/` 파일이다. `logs/` 산출물은 루트 `.gitignore` 정책에 따라 로컬 운영 기록으로만 존재한다.

| 변경 파일 | 실제 변경 | 영향 경로 | 런타임 영향 |
| --- | --- | --- | --- |
| `flownote/tsconfig.app.json` | `compilerOptions.ignoreDeprecations = "6.0"` 추가 | `yarn build` → Vite/TypeScript가 `src/` 전체를 검사 | 컴파일러 진단 억제 설정이며 브라우저 번들 동작과 API 계약은 바꾸지 않는다. 현재 TypeScript는 `^5.9.3`이다. |
| `flownote/src/entities/canvas/model/types.ts` | 파일 끝 개행 제거 | `entities/canvas/index.ts` → canvas feature hooks/models → Canvas widgets | 타입 선언 내용은 동일하므로 의미 변화는 없다. 포맷 차이만 존재한다. |
| `ARCHITECTURE.md` | 현재 서비스/통신/변경 영향 코드맵 보강 | 저장소 탐색과 변경 영향 분석 기준 | 문서 전용 변경이며 실행 코드에는 영향이 없다. |
| `logs/bugs/2026-08-05-flownote-ai-docker-venv-overwrite.md` | 통합 검증 중 발견한 AI 컨테이너 exit 127 원인 기록 | `flownote-ai/.dockerignore` 후속 수정 근거 | 기록 전용이며 이번 작업에서는 실행 코드를 수정하지 않는다. |
| `logs/report/2026-08-05-0143-architecture-code-map.md` | 검증 및 배포 결과 기록 | 빌드·Compose·Vercel·Railway 상태 근거 | 기록 전용이다. |

캔버스 타입의 실제 의존 흐름은 다음과 같다.

```text
entities/canvas/model/types.ts
  -> entities/canvas/index.ts
  -> features/canvas/model/*
     (drawing, rendering, persistence, history, selection, assets)
  -> widgets/CanvasWidget/InfiniteCanvas/*
  -> CanvasSavePayload / CanvasLoadData
  -> Socket.IO canvas:save / canvas:load
  -> flownote-API/app/canvas_socket.py
  -> flownote-canvas/internal/canvas/{model,handler,repo}.go
  -> PostgreSQL canvas_* tables
```

따라서 `types.ts`에 의미 있는 필드 변경이 생기면 프론트 직렬화, Socket.IO 이벤트 계약, Go DTO와 저장소 코드를 함께 확인해야 한다. 이번 변경에는 타입 필드 변경이 없다.

## 통신 및 라우팅 맵

| 진입 경로/프로토콜 | 소유 서비스 | 주요 코드 |
| --- | --- | --- |
| `/api/users/**`, `/api/mobile/**`, 그 외 기본 `/api/**` | Spring | `flownote-API/app/gateway.py` → `flownote-server/src/main/java/com/flownote/{user,mobile}/` |
| `/api/canvas/**`, `/api/notes/**`, `/api/note-folders/**`, `/api/upload/**`, `/api/admin/**`, `/uploads/**` | Go canvas | `flownote-API/app/gateway.py` → `flownote-canvas/internal/{canvas,notes}/` |
| `/api/schedule-items/**`, `/api/tasks/**`, `/api/stocks/**`, `/api/social/**`, `/api/chat/**`, `/api/diary/**` | Go serve | `flownote-API/app/gateway.py` → `flownote-serve/internal/` |
| `/api/aiclient/**`, `/api/agent-note/**`, `/api/market/**` | Python AI | `flownote-API/app/gateway.py` → `flownote-ai/app/api/` |
| Socket.IO `canvas:*` | FastAPI gateway + Go canvas | `flownote/src/features/canvas/model/canvasSocketClient.ts` → `flownote-API/app/canvas_socket.py` → Go canvas HTTP |
| SSE AI 응답 | Python AI | `/api/aiclient/ask_stream`, 게이트웨이의 스트리밍 프록시 |
| SSE 주식 스트림 | Go serve | `/api/stocks/stream`, 게이트웨이의 스트리밍 프록시 |
| 내부 LLM HTTP | Ollama | `flownote-ai/app/services/ollama_client.py` → `ollama:11434` |

모든 사용자 보호 API는 `Authorization: Bearer <session UUID>`를 전달한다. Spring은 세션을 발급하고 Go 서비스는 같은 `app_sessions` 테이블과 Redis 캐시를 이용해 사용자를 확인한다. 게이트웨이는 `X-Request-ID`와 전달 헤더를 유지하며, 연결이 성립되기 전의 상류 연결 오류만 최대 2회 재시도한다.

## Canvas

캔버스 한 기능이 4개 하위 프로젝트에 걸쳐 있으므로, 수정 시 아래 지도를 기준으로 영향 범위를 잡는다.

### `flownote/` — 화면·상태·오프라인 복원력 (FSD)

| 위치 | 파일 | 책임 |
| --- | --- | --- |
| `app/routers/Canvas/` | `list.tsx` · `route.tsx` | `/canvas` 목록 페이지, `/canvas/:canvasId` 에디터 라우팅 |
| `app/routers/AdminCanvas/` | `route.tsx` | 관리자 진단 화면 — Go의 `/api/admin/canvas/*` 호출 |
| `entities/canvas/` | `model/types.ts` | 요소 타입(Line·Image·TextBox), `CanvasSavePayload`/`CanvasLoadData`, `ToolType` |
| | `api/canvasLibraryData.ts` | 문서·폴더 CRUD 10종 — `VITE_CANVAS_API_URL`(Go) 직결 |
| `features/canvas/model/` | `usePersistence.tsx` | 저장/로드 오케스트레이션의 중심: dirty 추적, 디바운스 자동 저장, 재시도 큐 소비, 원격 변경 큐·**증분 델타 적용**, 소켓 방 참여·재연결 즉시 재시도 |
| | `canvasSocketClient.ts` | Socket.IO 싱글턴, 요청/ack(`canvas:save`·`canvas:load`), 이벤트 타입 |
| | `canvasLocalDraft.ts` | 재시도 큐(캔버스별 1항목·백오프·재연결 리셋), 로컬 초안 직렬화 |
| | `canvasIndexedDb.ts` | 재시도 큐·초안·기기 진단의 IndexedDB 영속화 |
| | `canvasPersistenceModel.ts` | 직렬화(serialize*), 트리거 우선순위 큐, 로드 데이터 정규화 |
| | `canvasAssetApi.ts` | 이미지 업로드·프록시 URL·`hydrateImageElement` |
| | `useCanvasHistory.tsx` | undo 명령 스택(50개 제한) |
| | `useDrawing` · `useElementManipulation` · `useCanvasRendering` · `useCanvasState` | 입력·요소 조작·Konva 렌더링·도구 상태 |
| | `canvasGeometry` · `canvasSpatialIndex` · `canvasSelectionModel` · `canvasTextBoxModel` | 좌표·rbush 공간 인덱스·라쏘 선택·텍스트박스 모델 |
| | `canvasLibraryModel` · `canvasViewportStorage` · `useStoredCanvasViewport` · `canvasDraftWorker` · `canvasConstants` · `canvasDom` | 목록 상태·뷰포트 저장·초안 워커·상수·DOM 헬퍼 |
| `widgets/CanvasWidget/` | `InfiniteCanvas/ui/Canvas.tsx` | 캔버스 본체(포인터·뷰포트·생명주기 플러시) |
| | `InfiniteCanvas/ui/Toolbar.tsx` · `CanvasLibraryPanel.tsx` · `NoteDrawingCanvas.tsx` | 툴바, 문서·폴더 사이드 패널, 노트 내 필기 |
| | `InfiniteCanvas/model/useLassoActions.ts` | 라쏘 선택 액션 |
| | `CanvasList.tsx` | 캔버스 목록 화면 |

### `flownote-API/` — 실시간 허브 (게이트웨이)

| 파일 | 책임 |
| --- | --- |
| `app/canvas_socket.py` | Socket.IO 허브: `canvas:join/leave` 방 관리, `canvas:save`/`canvas:load` 중계(Go로 HTTP 전달, 저장 90s 타임아웃), 라인 스트림 브로드캐스트, **`canvas:changed`+`changes` 증분 브로드캐스트(256KB 가드)**, 자산 업로드 중계 |
| `app/gateway.py` | HTTP `/api/canvas/**` → `CANVAS_API_BASE_URL` 프록시(스트리밍·재시도·X-Request-ID) |
| `app/core_api.py` | 백엔드 전달 헬퍼(`forward_request`, base_url·timeout 파라미터) |
| 환경 변수 | `CANVAS_API_BASE_URL`, `CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS`(기본 90), `CANVAS_CHANGED_MAX_INLINE_BYTES`(기본 256KB) |

### `flownote-canvas/` — 영속화 전담 (Go)

| 파일 | 책임 |
| --- | --- |
| `main.go` | HTTP 서버, 요청 로그(canvasId 쿼리 포함·2s 초과 SLOW), 진단 이벤트 30일 보존 잡 |
| `internal/canvas/handler.go` | `/api/canvas/**` 라우트(load·save·metadata·elements·viewport·documents·folders·assets) |
| `internal/canvas/repo.go` | 트랜잭션+advisory lock, mutation 멱등 원장, **pgx.Batch 배치 upsert**, 레거시 S3 오프로드(`object_key`) 읽기 호환 |
| `internal/canvas/admin.go` | 관리자 진단(`/api/admin/canvas/summary·events`) — Spring에서 이관 |
| `internal/canvas/model.go` | 요청/응답 DTO(프론트와 snake_case 계약) |
| `internal/auth/` | `app_sessions` 공유 세션 인증, ADMIN 역할 검사 |
| `internal/storage/` · `internal/config/` · `internal/httpjson/` | S3 클라이언트, 환경 설정(PORT 기본 8090), JSON 응답 헬퍼 |

### `flownote-server/` — 스키마 소유만 (Spring)

캔버스 실행 코드는 **없다**(2026-07-13 완전 이관). 남은 것은 캔버스 테이블의 Flyway 마이그레이션 소유권뿐이다: `V11`(documents·folders) · `V12`(assets·elements·viewports) · `V13`(payload 중복 정리) · `V17`(element snapshots) · `V18`(mutation ledger) · `V19`(resilience·admin diagnostics). 스키마 변경은 여기에 새 버전을 추가하고 Go의 read/write 양쪽을 함께 확인한다.

### 공유 DB 테이블 (PostgreSQL)

`canvas_documents`(문서·revision) · `canvas_elements`(요소, 인라인 payload) · `canvas_mutations`(멱등 원장) · `canvas_viewports` · `canvas_folders` · `canvas_assets`(S3 메타) · `canvas_operation_events`(진단, 30일 보존) · `canvas_storage_jobs`(레거시 아웃박스, 신규 기록 없음)

## Typing area (노트)

노트 도메인은 캔버스와 같은 서버(`flownote-canvas/`)가 소유한다 — Spring에서 이관(2026-07-16).

| 서버 | 위치 | 책임 |
| --- | --- | --- |
| `flownote/` | `entities/blog/api/` · `widgets/BlogWidget/` | 노트 CRUD 호출(`/api/notes`·`/api/note-folders`, 게이트웨이 경유)과 BlockNote 에디터. 에디터 이미지는 `/api/notes/upload` → `/uploads/**` |
| `flownote-API/` | `app/gateway.py` | `/api/{notes,note-folders,upload}`·`/uploads/**` → 캔버스 백엔드 프록시 |
| `flownote-canvas/` | `internal/notes/{model,repo,handler}.go` | 노트 본문 S3 오프로드(`note-content/{user}/{note}/{rev}-{clientKey}.json`), revision+client_id 낙관적 동시성(409), 폴더 uuid[] 관리, 업로드 정적 서빙(`FLOWNOTE_UPLOAD_DIR`) |
| DB | `notes` · `note_folders` | Flyway 소유는 Spring(V2·V6·V20) |

## 부가기능 (flownote-serve)

일기·일정·작업·주식·소셜·채팅은 Spring에서 Go로 이관되었다. 응답·요청은 Spring의 Jackson `SNAKE_CASE` 계약을 유지한다.

| 파일 | 책임 |
| --- | --- |
| `internal/diary/diary.go` | `/api/diary`, `/api/diary/dates`, `/api/diary/{date}` — 날짜별 시간표·할 일·저널 저장 |
| `internal/schedule/schedule.go` | `/api/schedule-items` — 자정 넘김 허용 검증, 메모 S3 오프로드, `updatedScheduleItem` 래퍼 |
| `internal/task/task.go` | `/api/tasks` — memo/links/time_logs S3 오프로드(작업당 고정 키), snake PATCH 동적 갱신 |
| `internal/stocks/stocks.go` | `/api/stocks/**` — 보유·현금(NUMERIC 정밀도 보존), 시세는 `STOCK_MARKET_DATA_URL`(게이트웨이→flownote-ai) 중계+합성 폴백, SSE `/stream` |
| `internal/social/social.go` | `/api/social/**` — 방 멤버십(비멤버 404), LATERAL 마지막 메시지, 메시지 S3 오프로드 |
| `internal/chat/chat.go` | `/api/chat/**` — 메시지 CRUD·전체 삭제, S3 오프로드 |
| `internal/{auth,httpjson,storage,config}/` | canvas와 동일 패턴 공유(세션 인증+Redis 캐시, JSON 응답, S3, 설정 PORT 기본 8095) |

## AI 및 시장 데이터 (flownote-ai)

| 위치 | 책임 |
| --- | --- |
| `app/api/agent_router.py` | `/api/aiclient/ask_stream` — AI 응답 스트림 |
| `app/api/agent_note_router.py` | `/api/agent-note/{health,index,query,ask}` — 노트 인덱싱과 질의 |
| `app/api/market_router.py` | `/api/market/{search,quotes,history}` — 외부 시장 데이터와 Redis TTL 캐시 |
| `app/services/agent_service.py` | 에이전트 요청 오케스트레이션과 MCP 도구 결합 |
| `app/services/agent_note_{service,store}.py` | Ollama 임베딩/질의와 로컬 SQLite 인덱스 관리 |
| `app/services/ollama_client.py` | 내부망 Ollama HTTP 클라이언트 |
| `app/core_api.py` | MCP/AI 서비스가 게이트웨이의 코어 API를 다시 호출하는 클라이언트 |

`flownote-ai/app/api/chat_router.py`와 `social_router.py`에는 호환 코드가 남아 있지만, 현재 게이트웨이의 `/api/chat`과 `/api/social` 라우팅 소유자는 `flownote-serve`다. 외부 클라이언트 기준 계약은 게이트웨이 라우팅을 우선한다.

## 프론트엔드 도메인 탐색

| 계층 | 기준 위치 | 탐색 규칙 |
| --- | --- | --- |
| 앱 조합 | `flownote/src/app/capabilityManifest.tsx` | 라우트, 활성화 여부, 인증 필요 여부의 단일 등록점 |
| 페이지 진입 | `flownote/src/app/routers/` | Blog, Canvas, Diary, Stocks, Task, Social, Agent, Auth 등 URL 단위 화면 |
| 도메인 모델/API | `flownote/src/entities/` | blog, canvas, chat, diary, schedule, social, stocks, task, users의 타입과 API |
| 사용자 동작 | `flownote/src/features/` | 인증, 캔버스 영속화/편집, 노트/일기/일정/작업 상태 로직 |
| 조합 UI | `flownote/src/widgets/` | 페이지에서 사용하는 큰 UI 단위 |
| 공통 통신 | `flownote/src/shared/api/index.ts` | 환경 변수 기반 API URL, LAN 호스트 치환, Bearer 인증 저장/헤더 |

`flownote-next/`는 2026-07-28 제거되었으므로 현재 코드맵과 통합 실행 대상에 포함하지 않는다. 과거 Next.js 동기화 URL 환경 변수는 프론트 호환 설정에 남아 있을 수 있으나 현재 저장소에는 Next 실행 서비스가 없다.

## 인증·세션

| 서버 | 위치 | 책임 |
| --- | --- | --- |
| `flownote-server/`(인증 서버) | `com.flownote.{auth,user,mobile,api}` | 가입/로그인(BCrypt)·사용자 검색·`/me`, 모바일 설정, 세션 발급(`app_sessions`) |
| 모든 백엔드 | Go `internal/auth/auth.go` · Spring `AuthService` | Bearer(UUID) → `app_sessions` 조회. **Redis 세션 캐시** `session:{token}` → `userId|role`, TTL 5분, 장애 시 DB 폴백(로그아웃 엔드포인트 없음 → TTL 오차만 허용) |
| Redis 기타 용도 | `flownote-API/app/canvas_socket.py`, `flownote-ai/app/api/market_router.py` | Socket.IO Redis 매니저(replica 대비), 시세 캐시(quotes 5s·search 1h·history 10m) |

## 데이터 및 스키마 소유권

| 저장소 | 소유/사용 코드 | 용도 |
| --- | --- | --- |
| PostgreSQL | Flyway: `flownote-server/src/main/resources/db/migration/`; 런타임: Spring/Go | 사용자, 세션, 캔버스, 노트, 일정, 작업, 주식, 소셜, 채팅의 기준 데이터 |
| Redis | Spring, 두 Go 서비스, API gateway, AI | 세션 캐시, Socket.IO 확장, 시장 데이터 캐시 |
| S3 호환 저장소 | `flownote-canvas/internal/storage/`, `flownote-serve/internal/storage/` | 캔버스 자산, 노트 본문, 일정/작업/메시지의 큰 payload |
| 로컬 업로드 볼륨 | `flownote-canvas/internal/notes/handler.go` | `/uploads/**` 정적 파일 (`/mnt/storage/uploads` ↔ `/public/uploads`) |
| SQLite 볼륨 | `flownote-ai/app/services/agent_note_store.py` | 에이전트 노트 인덱스 (`agent-note-data`) |

스키마 변경은 Spring Flyway에 새 버전을 추가한다. 실제 읽기/쓰기를 Go 서비스가 수행하는 테이블은 마이그레이션과 해당 Go DTO·쿼리를 같은 변경에서 검증한다.

## 실행 및 배포 코드맵

| 환경 | 구성 파일 | 실행/배포 대상 |
| --- | --- | --- |
| 로컬/내부망 | `docker-compose.yml`, 각 서비스 `Dockerfile` | `db`, `redis`, `spring-server`, `canvas-server`, `serve-server`, `ai-server`, `api-server`, `react-app`, `mobile-app`, 내부 전용 `ollama` |
| Vercel production | `flownote/vercel.json` | Vite SPA와 SPA fallback rewrite |
| Railway | 각 백엔드의 `railway.json` | `flownote-API`, `flownote-server`, `flownote-canvas`, `flownote-serve`, `flownote-ai`; Dockerfile 빌드와 서비스별 healthcheck |

로컬 포트는 React `5173`, gateway `8000`, Spring `8080`, canvas `8090`, serve `8095`, AI host `8010`, mobile `8081`, PostgreSQL `5432`, Redis `6379`다. Ollama는 Compose 내부의 `ollama:11434`로만 접근하며 공개 포트를 두지 않는다.
