# 개요



# 시스템 구성 (조감도)

Flownote는 기획한 내용을 바탕으로 관련 필기를 텍스트와 그림으로 표현하여 새로운 아이디어를 만들거나 기존의 내용을 정리하며 지식을 정리하게 돕는 노트이다. 주된 기능은 그림판(Canvas)과 작성 영역(Text Pad)이며 부가적인 기능을 이용하여 그림판과 작성영역과의 유기적인 조합을 이루는 방식으로 개발되었다. 

그림판은 연필이나 펜을 통해 작성하는 방식을 말하며 이는 고전적인 필기를 중심으로 작성되는 기능이다. 이 기능을 주요 작성 방법으로 정하면 대상의 연결성과 높은 직관력을 가지는 시각적 표현의 장점을 이용하는 곳으로 주로 구상이나 이해를 중시할 때 작성되는 방식이다. 

작성 영역은 키보드와 같은 타이핑 기기를 통해 작성되는 기능을 말하며, 이를 주된 작성법으로 정하면 엄밀하게 정의되어야 하거나 정보의 오류가 없어야 하는 내용을 담는 것이 주된 내용이 된다. 그리고 그림판 기능과 달리 단방향으로 작성하기 때문에 시간을 기반으로 하는 정보를 작성하는데 용이하다. 

위의 주된 기능을 바탕으로 작성하는 내용을 기록하는데 불편함을 겪는 경우에 이용하는 것이 부가적인 기능이다. 텍스트나 선 데이터를 가지고 표현하기 어려운 경우, 사용자가 해당되는 지식을 나타내는 것이 어려운 경우나 실시간으로 변하는 값을 이용하는 경우와 같이 어려움을 갖는 경우에 사용하는 기능이다. 

# Code map

## `flownote/` : flownote의 프론트엔드를 다루는 곳이다.
## `flownote/src` : flownote의 프론트와 직접관련된 소스 코드를 작성하는 곳으로 FSD 방식으로 코드를 작성하는 것을 주로 둔다.
## `flownote-mobile/` : flownote의 IOS/Android 앱을 다루는 서버이다.
## `flownote-next/` : `flownote/`에서 클라이언트가 요청한 데이터를 가공해 전송하는 서버이다.
## `flownote-server/` : 인증(계정·세션)과 모바일 설정만 담당하는 **인증 서버**다. 노트는 `flownote-canvas/`로, 일정·작업·주식·소셜·채팅은 `flownote-serve/`로 완전 이관되었다.
## `flownote-canvas/` : 캔버스와 노트(필기 도메인)를 담당하는 Go 서버이다.
## `flownote-serve/` : 부가기능(일정·작업·주식·소셜·채팅)을 담당하는 Go 서버로, 게이트웨이 뒤에서 요청 시에만 깨어난다(서버리스).
## `flownote-API/` : flownote API 라우터로 flownote의 여러 마이크로서비스를 연결하는 api를 관리하는 서버이다.

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

일정·작업·주식·소셜·채팅 — Spring에서 이관(2026-07-16). 응답·요청은 Spring의 jackson SNAKE_CASE 계약을 유지한다.

| 파일 | 책임 |
| --- | --- |
| `internal/schedule/schedule.go` | `/api/schedule-items` — 자정 넘김 허용 검증, 메모 S3 오프로드, `updatedScheduleItem` 래퍼 |
| `internal/task/task.go` | `/api/tasks` — memo/links/time_logs S3 오프로드(작업당 고정 키), snake PATCH 동적 갱신 |
| `internal/stocks/stocks.go` | `/api/stocks/**` — 보유·현금(NUMERIC 정밀도 보존), 시세는 `STOCK_MARKET_DATA_URL`(게이트웨이→flownote-ai) 중계+합성 폴백, SSE `/stream` |
| `internal/social/social.go` | `/api/social/**` — 방 멤버십(비멤버 404), LATERAL 마지막 메시지, 메시지 S3 오프로드 |
| `internal/chat/chat.go` | `/api/chat/**` — 메시지 CRUD·전체 삭제, S3 오프로드 |
| `internal/{auth,httpjson,storage,config}/` | canvas와 동일 패턴 공유(세션 인증+Redis 캐시, JSON 응답, S3, 설정 PORT 기본 8095) |

## 인증·세션

| 서버 | 위치 | 책임 |
| --- | --- | --- |
| `flownote-server/`(인증 서버) | `com.flownote.{auth,user,mobile,api}` | 가입/로그인(BCrypt)·사용자 검색·`/me`, 모바일 설정, 세션 발급(`app_sessions`) |
| 모든 백엔드 | Go `internal/auth/auth.go` · Spring `AuthService` | Bearer(UUID) → `app_sessions` 조회. **Redis 세션 캐시** `session:{token}` → `userId|role`, TTL 5분, 장애 시 DB 폴백(로그아웃 엔드포인트 없음 → TTL 오차만 허용) |
| Redis 기타 용도 | 게이트웨이 socket.io Redis 매니저(REDIS_URL 시, replica 대비) · flownote-ai 시세 캐시(quotes 5s·search 1h·history 10m) | |