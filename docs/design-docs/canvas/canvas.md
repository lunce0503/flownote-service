# Canvas 코드맵

## 목적과 범위

Canvas는 자유 필기, 이미지, 텍스트 박스를 무한 좌표계에서 편집하고 Socket.IO 증분 저장으로 영속화하는 기능이다. 이 문서는 웹 클라이언트의 `/canvas` 목록부터 Go 저장소까지의 호출 경로와 변경 시 지켜야 할 상태 불변식을 소유한다.

## 전체 호출 흐름

1. `/canvas`의 `CanvasList.tsx`가 문서와 폴더를 HTTP로 함께 불러온다.
2. 최근 문서를 수정/생성 시각 내림차순으로 먼저 보여주고, 카테고리별 폴더와 폴더 없는 문서를 이어서 보여준다.
3. 문서를 선택하면 문서 ID를 사용해 `/canvas/:canvasId`로 이동한다.
4. 상세 화면 `Canvas.tsx`는 URL의 문서 하나만 편집하며, 폴더 관리는 하지 않는다. 툴바의 뒤로 버튼이 `/canvas`로 이동한다.
5. 포인터 입력이 선, 이미지, 텍스트 상태를 바꾸면 `usePersistence.tsx`가 dirty 요소를 Socket.IO `canvas:save` payload로 만든다.
6. FastAPI Socket.IO 허브가 인증과 방 브로드캐스트를 처리하고 Go Canvas 서비스로 저장 요청을 전달한다.
7. Go 서비스는 mutation 멱등성과 revision을 확인한 뒤 PostgreSQL과 S3 호환 저장소에 반영한다.

## 서비스 및 데이터 소유권

| 경계 | 소유 코드 | 책임 |
| --- | --- | --- |
| 라우팅/화면 | `flownote/src/app/routers/Canvas/`, `widgets/CanvasWidget/` | 목록, 상세 편집기, 툴바 |
| 클라이언트 도메인 | `entities/canvas/`, `features/canvas/` | 타입, HTTP API, 좌표/선택/렌더/저장 모델 |
| 실시간 허브 | `flownote-API/app/canvas_socket.py` | Socket.IO 인증, ack, 방, Go 전달 |
| 영속화 | `flownote-canvas/internal/canvas/` | 문서/폴더/요소 CRUD, revision, mutation 원장 |
| 스키마 | `flownote-server/src/main/resources/db/migration/` | Canvas PostgreSQL Flyway 마이그레이션 |

## 웹 프론트엔드

| 파일 | 역할 |
| --- | --- |
| `widgets/CanvasWidget/CanvasList.tsx` | 문서·폴더 CRUD, 드래그 이동, 최근/카테고리/폴더 없음 정렬 |
| `widgets/CanvasWidget/InfiniteCanvas/ui/Canvas.tsx` | 현재 URL 문서의 상태 조합, 편집 생명주기, 저장 플러시 |
| `widgets/CanvasWidget/InfiniteCanvas/ui/Toolbar.tsx` | 상위 목록 이동, 도구, 저장/로드, 확대/축소 |
| `widgets/CanvasWidget/InfiniteCanvas/model/useCanvasPointerInput.ts` | 포인터 도구 분기와 제스처 상태 머신 |
| `widgets/CanvasWidget/InfiniteCanvas/model/useLassoActions.ts` | 선택 이동, 크기, 색상, 복사, 레이어, 삭제 |
| `shared/lib/librarySorting.ts` | Canvas와 Blog가 공유하는 최근/카테고리 정렬 |

## 포인터 입력과 렌더링

- 입력 좌표는 `useCanvasState`와 `useCanvasPointerInput`에서 offset/scale을 반영해 월드 좌표로 변환한다.
- 선은 `useDrawing`, 이미지와 텍스트는 `useElementManipulation`이 소유한다.
- `useCanvasRendering`은 Konva의 정적/활성/오버레이 레이어를 재사용하고 `deleted` 요소를 렌더 입력에서 제외한다.
- `CanvasSpatialIndex`와 `canvasSelectionModel`도 `deleted` 요소를 선택 후보에서 제외한다.

## 상태와 히스토리

요소 상태는 `new | modified | deleted | unchanged`다.

- `new` 요소 삭제: 서버에 존재하지 않으므로 배열에서 즉시 제거한다.
- `unchanged` 또는 `modified` 요소 삭제: 배열에 `deleted` tombstone으로 남긴다.
- 삭제에는 `removeOrMarkDeleted()`를 사용한다. `markModified()`는 삭제 함수가 아니며 `deleted`를 전달하면 `modified`로 바꾸므로 삭제 경로에서 사용하지 않는다.
- 지우개와 올가미 삭제는 같은 삭제 함수를 사용해야 렌더 상태와 `deletedLines`/`deletedImages`/`deletedTextBoxes` payload가 일치한다.
- 변경 전에 `recordHistory()`를 호출하고 undo는 서버 저장 여부를 고려해 상태를 복원한다.

## 텍스트 박스 UX

- 텍스트 도구로 빈 공간을 누르면 새 박스를 만들고 기존 박스를 누르면 편집한다.
- `Enter`는 확정 후 이동 도구로 전환한다.
- `Shift+Enter`는 줄바꿈이다.
- `Escape`는 새 박스를 제거하거나 기존 박스를 편집 전 snapshot으로 복원한다.
- 빈 값을 확정하면 새 요소는 제거하고 기존 요소는 삭제 tombstone으로 바꾼다.

## 저장과 로드

- `usePersistence.tsx`가 dirty ID, revision, mutation ID, 자동 저장, 수동 저장, unload flush를 조합한다.
- 로드는 Socket.IO `canvas:load`, 저장은 `canvas:save` ack 계약을 사용한다.
- 저장 성공 후 삭제 tombstone은 제거하고 나머지는 `unchanged`로 바꾼다.
- 서버 변경 이벤트는 문서 ID를 기준으로 현재 문서에 증분 적용한다.

## 로컬 초안과 재시도

- `canvasLocalDraft.ts`가 현재 요소 snapshot과 pending 여부를 직렬화한다.
- `canvasIndexedDb.ts`가 초안과 캔버스별 재시도 큐를 영속화한다.
- 원격 revision이 로컬 초안의 base revision보다 최신이면 충돌 상태를 표시한다.
- 재시도 payload는 전송 전에 현재 dirty 상태와 다시 비교한다.

## 통신 계약

| 방식 | 경로/이벤트 | 목적 |
| --- | --- | --- |
| HTTP | `/api/canvas/documents` | 문서 목록·생성·수정·삭제 |
| HTTP | `/api/canvas/folders` | 폴더 CRUD와 문서 소속 변경 |
| HTTP | `/api/canvas/assets` | 이미지 자산 업로드와 조회 |
| Socket.IO | `canvas:join`, `canvas:leave` | 문서별 실시간 방 |
| Socket.IO | `canvas:load`, `canvas:load-cancel` | 전체 상태 로드와 취소 |
| Socket.IO | `canvas:save` | 요소별 added/modified/deleted 증분 저장 |
| Socket.IO | `canvas:line-*`, `canvas:changed` | 실시간 선 스트림과 원격 변경 알림 |

## 실패 및 복구 흐름

- 로드 실패: 로컬 초안이 있으면 복원하고 상태 메시지에 실패를 표시한다.
- 저장 실패: IndexedDB 재시도 큐에 남기고 사용자가 재시도 취소 또는 새 입력을 선택할 수 있다.
- 409 revision 충돌: 원격 상태를 확인한 뒤 로컬 변경을 최신 revision 위에 다시 구성한다.
- 삭제 후 화면에 요소가 남음: 요소 status, `removeOrMarkDeleted`, Konva reconcile, 저장 payload 순서로 확인한다.

## 변경 영향표

| 변경 | 함께 확인할 위치 |
| --- | --- |
| 요소 필드/status | `entities/canvas/model/types.ts`, persistence 직렬화, Go DTO/repo |
| 삭제 동작 | 지우개, 올가미, undo, 렌더 reconcile, E2E payload |
| 문서/폴더 UI | `CanvasList.tsx`, Canvas HTTP API, `librarySorting.ts` |
| 라우트 | `capabilityManifest.tsx`, 목록 링크, 상세 `useParams` |
| Socket.IO 이벤트 | 클라이언트 타입, FastAPI 허브, Go handler |

## 검증 명령

```bash
cd flownote
yarn typecheck
yarn build
docker run --rm --network host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.62.1-noble yarn e2e
cd ..
docker compose up -d --build
```

삭제 회귀는 `flownote/e2e/canvas-save.spec.ts`, 목록과 라우팅 회귀는 `flownote/e2e/library-navigation.spec.ts`가 담당한다.

## 관련 문서

- `ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/RELIABILITY.md`
- `docs/DEPLOYMENT.md`
- `logs/bugs/2026-08-26-canvas-lasso-delete-status.md`
