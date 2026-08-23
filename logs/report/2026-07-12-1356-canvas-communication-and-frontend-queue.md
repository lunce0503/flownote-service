cd# 캔버스 통신 방식 & 프론트 실행 큐 정리

- 일시: 2026-07-12 13:56 (로컬)
- 브랜치: `feat/canvas-id-routing`
- 목적: 캔버스 기능이 어떤 서버·DB를 거쳐 통신하는지와, 프론트엔드가 저장/재시도를 어떤 큐로 관리하는지 문서화(코드 기준). 소스 코드가 기준이며 문서가 다르면 코드를 우선한다.

---

## 1. 통신 방식 — 거쳐가는 서버와 DB

캔버스는 단일 서버가 아니라 **작업 종류에 따라 3개 채널**로 통신한다.

```
┌───────────────────── flownote (React SPA) ─────────────────────┐
│  ① 문서/폴더 CRUD (HTTP)   ② 실시간 드로잉·요소 (Socket.IO)   ③ 이미지 자산 (HTTP) │
└──────┬───────────────────────────┬─────────────────────────┬────┘
       │ VITE_CORE_API_URL          │ VITE_CANVAS_SOCKET_URL    │ VITE_CANVAS_API_URL
       ▼                            ▼                           │
   ┌────────┐            ┌────────────────────┐                │
   │ Spring │            │ flownote-api        │                │
   │flownote│            │ (FastAPI 게이트웨이 │                │
   │ -main  │            │  + Socket.IO 서버)  │                │
   └───┬────┘            └─────────┬──────────┘                │
       │                canvas_socket.py 릴레이(CANVAS_API_BASE_URL) │
       │                          ▼                             ▼
       │                 ┌──────────────────────────────────────┐
       │                 │  flownote-canvas (Go 캔버스 백엔드)   │
       │                 └──────────────────┬───────────────────┘
       ▼                                    ▼
   ┌───────────────── PostgreSQL (Spring·Go 공유) ─────────────────┐
   │ canvas_documents / canvas_folders / canvas_elements /         │
   │ canvas_viewports / canvas_assets / canvas_mutations           │
   └───────────────────────────────────────────────────────────────┘
                                    │ (이미지 바이트)
                                    ▼
                              S3 호환 스토리지
```

### ① 문서·폴더 목록 CRUD → Spring(flownote-main) 직결
- `entities/canvas/api/canvasLibraryData.ts`가 `API_CORE_BASE_URL`(=`VITE_CORE_API_URL`=Spring)로 axios 호출.
- `GET/POST /api/canvas/documents`, `PATCH/DELETE /api/canvas/documents/:id`, `GET/POST /api/canvas/folders`, `PATCH/DELETE /api/canvas/folders/:id`, 폴더-문서 연결.
- Spring이 PostgreSQL `canvas_documents`·`canvas_folders`에 read/write. (`/canvas` 목록 페이지도 이 경로.)

### ② 실시간 드로잉·요소 저장/로드 → Socket.IO → FastAPI → Go
- `features/canvas/model/canvasSocketClient.ts`가 `VITE_CANVAS_SOCKET_URL`(=FastAPI)로 Socket.IO(`path:/socket.io`, websocket/polling) 연결.
- 이벤트: `canvas:join`/`leave`(방), `canvas:line-start`/`points`/`end`(실시간 스트로크 — FastAPI가 같은 방 다른 클라이언트에 브로드캐스트), `canvas:load`, `canvas:load-cancel`, `canvas:save`, `canvas:asset-upload`.
- FastAPI `canvas_socket.py`는 **로직 없이 `CANVAS_API_BASE_URL`(Go)로 HTTP 중계**:
  - `canvas:load` → Go `GET /api/canvas/metadata` + `GET /api/canvas/elements`
  - `canvas:save` → Go `POST /api/canvas/elements/save`
  - `canvas:asset-upload` → Go `POST /api/canvas/assets`
- Go가 PostgreSQL `canvas_elements`(type+payload), `canvas_mutations`(멱등성), `canvas_documents.revision`에 read/write.

### ③ 이미지 자산 HTTP → Go(flownote-canvas) 직결
- `usePersistence.tsx`의 `CANVAS_API_URL`(=`VITE_CANVAS_API_URL`=Go): `GET /api/canvas/assets/:id`, `/api/canvas/assets/by-key`(프록시 조회), 업로드.
- Go가 S3에 바이트 저장 + `canvas_assets`에 메타 기록.

### DB / 스토리지
- **PostgreSQL(공유)**: `canvas_documents`(문서·revision·JSONB 폴백), `canvas_elements`, `canvas_folders`, `canvas_viewports`, `canvas_assets`, `canvas_mutations`. Spring과 Go가 호환 포맷으로 공유(스키마 소유·마이그레이션은 Spring Flyway).
- **S3 호환 스토리지**: 이미지 바이트(+ Spring 경로의 요소 스냅샷 오프로드).
- **Redis**: Spring 캔버스 캐시(Go는 미사용, DB 직접).

### API 요약
| 작업 | 프론트 채널 | 거쳐가는 서버 | 최종 |
| --- | --- | --- | --- |
| 문서·폴더 CRUD | HTTP `VITE_CORE_API_URL` | Spring | PostgreSQL |
| 요소 로드/저장·메타데이터 | Socket.IO `VITE_CANVAS_SOCKET_URL` | FastAPI(중계)→Go | PostgreSQL |
| 실시간 스트로크 | Socket.IO | FastAPI(룸 브로드캐스트) | (+저장 시 Go) |
| 이미지 조회/업로드 | HTTP `VITE_CANVAS_API_URL` | Go | S3 + PostgreSQL |

### 일관성 갭(주의)
- 요소·자산은 Go로, **문서·폴더 CRUD는 아직 Spring 직결**. 같은 PostgreSQL을 공유해 데이터는 일관되나 "캔버스=Go 전담"이 완전하진 않다.
- 게이트웨이의 `/api/canvas` HTTP 프록시는 실제 문서/폴더 트래픽에 쓰이지 않음(프론트가 Spring·Go로 직접 감).
- 정리안: `canvasLibraryData.ts` 베이스를 `VITE_CANVAS_API_URL`로 바꿔 문서·폴더도 Go로 통일(Go에 엔드포인트 이미 구현됨, 배선만 변경).

---

## 2. 프론트 실행 큐 — 저장/재시도 관리

단일 큐가 아니라 **유실 방지 → 전송 → 재시도** 계층으로 구성된다.

```
사용자 편집
 ├─(A) 로컬 초안 큐 ── 1.5s 디바운스 → IndexedDB (크래시/새로고침 복원, Web Worker 직렬화)
 └─(B) 저장 트리거 큐 ── 800ms 디바운스 → (C) single-flight 전송
        (우선순위 정렬)                       성공→완료 / 실패→(D) 재시도 큐(영속·지수 백오프)
```

### (A) 로컬 초안 큐 — 데이터 유실 방지 (`canvasLocalDraft.ts`)
- `scheduleCanvasLocalDraft`가 **1.5초 디바운스**(`CANVAS_DRAFT_WRITE_DELAY_MS`)로 현재 상태를 **IndexedDB**(`canvasIndexedDb.ts`)에 초안 저장.
- 직렬화는 **Web Worker**(`canvasDraftWorker.ts`) — 메인 스레드 블로킹 방지, 실패 시 동기 폴백.
- `hasPendingChanges` 없으면 초안 삭제. 새로고침/크래시 후 `readCanvasLocalDraftPersisted`로 복원. 서버 저장과 독립된 안전망.

### (B) 저장 트리거 우선순위 큐 (`usePersistence.tsx`, `pendingSaveTriggersRef`)
- 우선순위: **manual(100) > flush(90) > auto(50) > retry(40)** (`SAVE_TRIGGER_PRIORITY`).
- `enqueueUniqueByPriority`가 중복 제거 + 우선순위 desc 정렬 → 급한 트리거 우선.
- 자동저장: 변경 시 **800ms 디바운스**(`autoSaveTimerRef`) → `handleSave("auto")`.

### (C) single-flight 전송 + 코얼레싱 (`handleSave`)
- **인플라이트 가드** `saveInFlightRef`: 진행 중이면 새 요청은 `saveAgainRequestedRef=true` 플래그만 → 중복 전송 방지.
- `do…while` 루프가 플래그/`localRevision` 변화를 보고 재실행 → 진행 중 쌓인 변경을 **하나의 전송으로 합침(coalescing)**.
- 매 저장마다 새 **`mutationId`(uuid)** → 서버 `canvas_mutations` 멱등성으로 중복 적용 차단.
- 전송: `saveCanvasPayload(CANVAS_SOCKET_URL, …)` → Socket.IO `canvas:save` → FastAPI → Go `POST /api/canvas/elements/save`.

### (D) 재시도 큐 — 영속 + 지수 백오프 (`canvasLocalDraft.ts` + `retryPendingSaves`)
- 실패 시 `addCanvasRetryQueueItem`이 payload·mutationId·priority를 재시도 큐에 넣고 **IndexedDB `canvasOperationQueue`에 영속**(탭 닫아도 유지).
- **캔버스별 1개 항목 병합**: 같은 `canvasId`면 최신 payload로 갱신(payload 변경 시 새 mutationId).
- `retryPendingSaves`가 `nextAttemptAt <= now` 항목을 **priority desc, createdAt asc**로 순차 재전송.
- **지수 백오프**: `nextAttemptAt = now + min(300s, 2^min(attempts+1, 8) × 1s)` (최대 5분). `AbortController`로 취소 가능. 성공 시 `clearCanvasRetryQueue`.

### (E) 원격 변경 큐 — 멀티클라이언트 (`remoteChangeQueueRef`)
- 다른 클라이언트의 `canvas:changed`/스트로크 이벤트를 큐잉 후 `setTimeout(…,0)`로 순차 드레인(`drainRemoteChangeQueue`) → 렌더 폭주 없이 반영.

### 상태 머신 (`saveState`, `CanvasSaveStatus`)
`idle → loading → pending("저장할 변경 있음") → saving("저장 중") → saved / failed → retrying`. `pendingRetries` 카운트로 "재시도 대기 N" 표기. 그림판 툴바 저장 상태 필이 렌더(재시도/취소 버튼 노출 포함).

### 파일 맵
| 관심사 | 파일 |
| --- | --- |
| 저장 오케스트레이션(트리거 큐·single-flight·재시도 실행) | `features/canvas/model/usePersistence.tsx` |
| 로컬 초안 + 재시도 큐 저장/병합/백오프 | `features/canvas/model/canvasLocalDraft.ts` |
| IndexedDB(초안·오퍼레이션 큐) | `features/canvas/model/canvasIndexedDb.ts` |
| 초안 직렬화 Web Worker | `features/canvas/model/canvasDraftWorker.ts` |
| 상태 타입·우선순위·enqueueUniqueByPriority | `features/canvas/model/canvasPersistenceModel.ts` |
| 소켓 전송 | `features/canvas/model/canvasSocketClient.ts` |

### 핵심 요약
낙관적 로컬 우선(IndexedDB 초안) → 디바운스·우선순위로 모아서 → single-flight로 중복 없이 전송 → 실패는 지수 백오프로 영속 재시도. `mutationId` ↔ 서버 멱등성이 짝을 이뤄 재시도가 중복 저장을 만들지 않는다.

---

## 검증 비고
- 문서 전용 보고서 작성 작업이므로 Docker 빌드·클라우드 배포는 생략(변경된 실행 산출물 없음).
- 근거 파일 존재·심볼 위치를 grep/read로 확인해 작성(상단 각 절의 파일·이벤트·상수는 코드 확인 결과).
