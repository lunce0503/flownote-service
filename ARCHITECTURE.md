# 개요



# 시스템 구성 (조감도)

Flownote는 기획한 내용을 바탕으로 관련 필기를 텍스트와 그림으로 표현하여 새로운 아이디어를 만들거나 기존의 내용을 정리하며 지식을 정리하게 돕는 노트이다. 
주된 기능은 그림판(Canvas)과 작성 영역(Text Pad)이며 부가적인 기능을 이용하여 그림판과 작성영역과의 유기적인 조합을 이루는 방식으로 개발되었다. 
그림판은 연필이나 펜을 통해 작성하는 방식을 말하며 이는 고전적인 필기를 중심으로 작성되는 기능이다. 이 기능을 주요 작성 방법으로 정하면 대상의 연결성과 높은 직관력을 가지는 시각적 표현의 장점을 이용하는 곳으로 주로 구상이나 이해를 중시할 때 작성되는 방식이다. 
작성 영역은 키보드와 같은 타이핑 기기를 통해 작성되는 기능을 말하며, 이를 주된 작성법으로 정하면 엄밀하게 정의되어야 하거나 정보의 오류가 없어야 하는 내용을 담는 것이 주된 내용이 된다. 그리고 그림판 기능과 달리 단방향으로 작성하기 때문에 시간을 기반으로 하는 정보를 작성하는데 용이하다. 
위의 주된 기능을 바탕으로 작성하는 내용을 기록하는데 불편함을 겪는 경우에 이용하는 것이 부가적인 기능이다. 텍스트나 선 데이터를 가지고 표현하기 어려운 경우, 사용자가 해당되는 지식을 나타내는 것이 어려운 경우나 실시간으로 변하는 값을 이용하는 경우와 같이 어려움을 갖는 경우에 사용하는 기능이다. 

# 코드맵

## `flownote/` : flownote의 프론트엔드를 다루는 곳
## `flownote/src` : flownote의 프론트와 직접관련된 소스 코드를 작성하는 곳으로 FSD 방식으로 코드를 작성하는 것을 주로 둔다.
### `flownote/src/app`: flownote 프론트엔드의 가장 최상위 폴더로 실제 렌더링을 할때 마지막으로 거쳐야하는 곳이다.

### `flownote/src/entities`: flownote 기능 중 비지니스 모델과 관련된 내용을 다루는 곳으로  
### `flownote/src/features`: 
### `flownote/src/pages`: 
### `flownote/src/shared`: 
### `flownote/src/widgets`: 

### `flownote-mobile/` : flownote의 IOS/Android 앱을 다루는 곳
### `flownote-next/` : `flownote/`에서 클라이언트가 요청한 데이터를 가공해 전송하는 서버
### `flownote-server/` : flownote 서비스의 메인 서버로 로그인 인증, 텍스트 패드(노트)·작업·일정 등 사용자 소유 데이터를 다루는 서버이다. 캔버스 기능은 `flownote-canvas/`(Go)로 완전 이관되었다.
### `flownote-API/` : flownote API 라우터로 flownote의 여러 마이크로서비스를 연결하는 api를 관리하는 서버

## 캔버스 코드맵 (서버별)

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

## 하위 서버 아키텍쳐

| 경로 | 역할 | 주요 책임 |
| --- | --- | --- |
| `flownote/` | Vite React 웹 앱 | 작업, 노트, 캔버스, 소셜, 주식 등 주요 사용자 화면 |
| `flownote-next/` | Next.js 앱 | Next app-router 기반 화면, API, Prisma/PostgreSQL 기능 |
| `flownote-API/` | **API 게이트웨이**(FastAPI) | 클라이언트 `/api/**`를 받아 백엔드로 라우팅(canvas→Go, AI/데이터→flownote-ai, 코어→Spring) + 실시간 캔버스 Socket.IO 중계. 자체 백엔드 로직 없음 |
| `flownote-canvas/` | **Go 캔버스 백엔드** | `/api/canvas/**` 전담(문서·폴더·요소·뷰포트·자산). flownote-server와 Postgres/S3 공유, 호환 포맷 read/write |
| `flownote-ai/` | **AI/데이터 백엔드**(FastAPI) | `/api/aiclient`(Gemini), `/api/agent-note`(내부망 Ollama), `/api/market`(주식), `/api/chat`, `/api/social`. flownote-API에서 분리 |
| `flownote-server/` | Spring Boot WAS | 인증, 사용자 소유 데이터, 작업/노트/일정/모바일 설정 API. 캔버스 코드는 **완전 제거**(Go로 이관, S3 자산 헬퍼만 `com.flownote.storage`로 이동해 노트·채팅·소셜이 공유) |
| `flownote-mobile/` | Expo 모바일 앱 | Spring WAS 설정을 읽어 WebView로 웹 앱을 여는 모바일 진입점 |
| `db` (PostgreSQL) | 관계형 DB · :5432 | Spring 소유 데이터 · Next Prisma 데이터 |
| `redis` (Redis) | 캐시 · :6379 | 캔버스 캐시 이관 제거 후 현재 미사용(연결 유지, 제거는 후속 결정) |
| `ollama` (Ollama) | 내부망 LLM · :11434 | gemma4:e2b(멀티모달) + embeddinggemma, 에이전트 노트 추론(클라우드 미배포) |
| `docker-compose.yml` | 로컬 통합 실행 | 위 앱·서버·인프라를 함께 실행 |

## 서비스 경계

- 사용자 인증과 사용자 소유 데이터의 기준은 `flownote-server`다.
- React 웹 앱은 `VITE_CORE_API_URL`로 Spring API를 호출하고, `VITE_AI_BASE_URL` 또는 `VITE_API_BASE_URL`로 FastAPI 기능을 호출한다.
- Next.js 앱은 Prisma/PostgreSQL을 사용하는 독립 흐름을 담당하되, 공통 DB 계약이 바뀌면 Spring과 함께 확인한다.
- 모바일 앱은 `EXPO_PUBLIC_WAS_URL`의 `/api/mobile/config`를 시작점으로 사용한다.
- DB 스키마 기준은 Spring Flyway 마이그레이션이며, 문서가 실제 마이그레이션과 다르면 마이그레이션을 우선한다.
- 캔버스 백엔드는 `flownote-canvas`(Go)가 전담한다. flownote-server(Spring)와 같은 Postgres/S3를 공유하고 `canvas_*` 테이블에 호환 포맷으로 read/write 한다. Go는 요소 payload를 인라인 저장(`object_key=NULL`, `storage_status='READY'`)하되, 과거 Spring이 S3로 오프로드한 데이터는 `object_key`로 읽어 호환한다. Spring의 캔버스 코드(컨트롤러·서비스·캐시·아웃박스 워커·관리자 진단)는 완전 제거되었고, 관리자 진단(`/api/admin/canvas/summary·events`)과 진단 이벤트 30일 보존 잡도 Go가 소유한다. 캔버스 테이블의 Flyway 마이그레이션 소유권은 Spring에 남는다(공유 DB 단일 소유 원칙).
- API 게이트웨이: `flownote-API`가 클라이언트 `/api/**`를 받아 경로로 백엔드를 정한다. `/api/canvas/**`→`CANVAS_API_BASE_URL`(Go), `/api/{aiclient,agent-note,market,chat,social}`→`AI_API_BASE_URL`(flownote-ai), 그 외 코어→`CORE_API_BASE_URL`(Spring). 게이트웨이 자신은 백엔드 로직이 없고 라우팅과 캔버스 소켓 중계만 한다.
  - 완전 게이트웨이 특성(`app/gateway.py`): **스트리밍 프록시**(SSE `ask_stream`·대용량을 버퍼링 없이 청크 전달), **콜드스타트 재시도**(연결 수립 실패는 백오프 재시도 — 상류 미처리라 POST 안전), **`X-Request-ID`** 생성·전파, 구조화 액세스 로그, hop-by-hop 헤더 정리·`X-Forwarded-*`.
  - 남은 일(프론트): 현재 프론트는 Spring·Go·flownote-ai를 각 `VITE_*`로 직결한다. 게이트웨이를 단일 진입점으로 쓰려면 `VITE_CORE_API_URL`/`VITE_AI_BASE_URL`을 게이트웨이로 모아야 한다.
- AI/데이터 백엔드는 `flownote-ai`가 담당한다: 메인 플래너 에이전트(외부 Gemini, MCP 도구의 최종 저장은 Spring Core API 경유), 에이전트 노트(내부망 Ollama — 클라우드 미배포라 클라우드 flownote-ai에서는 미동작), 주식 시세(Spring이 `STOCK_MARKET_DATA_URL`=게이트웨이 경유로 소비), 채팅, 소셜.
- 운영 주의: Railway 서비스가 유휴로 잠들면 게이트웨이의 첫 프록시 요청이 백엔드를 깨우는 동안 502가 날 수 있다(웜업 후 정상). 상시 가동이 필요하면 min instance 설정.
- 실시간 캔버스는 React ↔ FastAPI Socket.IO로 연결되고, FastAPI가 스트로크/이미지/텍스트를 `CANVAS_API_BASE_URL`(Go)의 캔버스 API에 중계·저장한다.
- 라우팅 지점: 프론트 `VITE_CANVAS_API_URL`(캔버스 HTTP), 게이트웨이 `CANVAS_API_BASE_URL`(소켓 중계 + HTTP 프록시). 둘 다 flownote-canvas(Go)를 가리킨다.
- 에이전트 노트의 Ollama와 그 기능은 내부망 전용이며 클라우드에 배포하지 않는다(클라우드 flownote-ai에서는 Ollama 부재로 미동작).

## 배포 토폴로지

로컬은 `docker-compose.yml`로 통합 실행하고, 프로덕션은 프론트=Vercel, 백엔드=Railway로 나뉜다. Ollama·에이전트 노트는 내부망 전용으로 클라우드에 올리지 않는다.

| 하위 프로젝트 | 프로덕션 대상 | 비고 |
| --- | --- | --- |
| `flownote/` (Vite) | Vercel `flownote-react` | 빌드타임 `VITE_*` 주입 |
| `flownote-next/` | Vercel `flownote-next` | Next.js |
| `flownote-API/` | Railway `flownote-api` | Socket.IO(wss), health `/` |
| `flownote-server/` | Railway `flownote-main` | health `/actuator/health` |
| `flownote-canvas/` (Go) | Railway `flownote-canvas` | `/api/canvas/**`·관리자 진단 전담, 변수는 flownote-main 참조, PORT=8080(로컬 8090) |
| `flownote-ai/` | Railway `flownote-ai` | 사설 :8000, 게이트웨이 내부 경유(공개 도메인 없음) |
| PostgreSQL · Redis | Railway 관리형 | 사설 네트워크 |
| Ollama · 에이전트 노트 | 배포 안 함 | 내부망 전용 |

내부망은 3계층으로 배선한다: 컨테이너 간 docker DNS(`spring-server:8080`, `api-server:8000`, `ollama:11434`), 실기기 접근용 `HOST_LAN_IP`(LAN), 프로덕션 public HTTPS.

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
| `logs/report/` | 리뷰, 감사, 배포 결과, 큰 작업 요약 | 다시 읽을 가치가 있는 분석 산출물 |
| `.codex/memories/` | 안정적인 프로젝트 컨벤션 후보 | 반복 적용할 수 있는 장기 지식 |
| `docs/` | 제품, 설계, 품질, 보안, 신뢰성 문서 | 코드와 운영 기준을 설명하는 장기 문서 |

`logs/`와 `logs/report/`는 소스 코드의 근거를 대체하지 않는다. 코드와 문서가 충돌하면 소스 코드, 마이그레이션, 실행 가능한 검증 결과를 우선한다.

## 검증 기준

- `flownote/`: `yarn build`
- `flownote-next/`: `yarn lint`, `yarn build`
- `flownote-API/`: `uv run ...`
- `flownote-server/`: `./gradlew test`
- 루트 통합: `docker compose up -d --build`

검증 실패는 실패한 명령, 핵심 오류, 영향 범위, 다음 조치를 함께 기록한다.
