# Canvas 코드맵

## 목적과 범위

Canvas는 자유 필기, 이미지, 텍스트 박스를 무한 좌표계에서 편집하고 Socket.IO 증분 저장으로 영속화하는 기능이다. 이 문서는 웹 클라이언트의 `/canvas` 목록부터 Go 저장소까지의 호출 경로와 변경 시 지켜야 할 상태 불변식을 소유한다.

## 전체 호출 흐름

1. `/canvas`의 `CanvasList.tsx`가 문서와 폴더를 HTTP로 함께 불러온다. 새 문서·폴더는 임시 ID로 즉시 표시하고 서버 성공 시 실제 ID로 교체하며, 실패하면 임시 항목을 제거한다.
2. 최근 문서를 수정/생성 시각 내림차순으로 먼저 보여주고, 카테고리별 폴더와 폴더 없는 문서를 이어서 보여준다.
3. 문서를 선택하면 문서 ID를 사용해 `/canvas/:canvasId`로 이동한다.
4. 상세 화면 `Canvas.tsx`는 URL의 문서 하나만 편집하며, 폴더 관리는 하지 않는다. 툴바의 격자 버튼이 `/canvas`로 이동하고 제목 영역에서 현재 문서 이름을 수정한다.
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
| `features/canvas/model/canvasClipboard.ts` | SPA 문서 이동 중 유지되는 캔버스 요소 클립보드 |
| `features/canvas/model/canvasPdfImport.ts` | PDF 페이지를 편집 가능한 이미지 파일로 변환 |
| `widgets/CanvasWidget/InfiniteCanvas/ui/CanvasPdfReader.tsx` | 현재 기기 전용 PDF 페이지 뷰어와 키보드/터치 격리 |
| `widgets/CanvasWidget/InfiniteCanvas/model/canvasPanMomentum.ts` | viewport px/ms 기반 유한 시간 감속과 취소 |
| `widgets/CanvasWidget/InfiniteCanvas/ui/CanvasToolPointer.tsx` | 실제 편집 입력과 분리한 4px 원형 위치 표시 |
| `widgets/CanvasWidget/InfiniteCanvas/model/canvasToolPointer.ts` | pen/touch 위치와 복수 접촉 숨김의 표시 상태 |
| `shared/lib/librarySorting.ts` | Canvas와 Blog가 공유하는 최근/카테고리 정렬 |

## 포인터 입력과 렌더링

- 최초 원격 로드가 끝날 때까지 입력 canvas는 `data-ready=false`이고 포인터 입력을 받지 않는다. 빈 원격 snapshot이 사용자의 첫 획을 덮어쓰면 안 된다.
- 입력 좌표는 `useCanvasState`와 `useCanvasPointerInput`에서 offset/scale을 반영해 월드 좌표로 변환한다.
- 지원 Pencil 호버는 확대율과 무관한 지름 4 CSS px 원으로 표시한다. Android/iOS 펜 접촉 필기 중에는 커서를 숨기고 지우개는 지름 32 CSS px 원으로 표시한다. 커서를 따라다니는 도구명·아이콘·바깥 링·그림자는 표시하지 않으며 현재 도구는 기존 도구막대에서 확인한다. 장식 원은 입력을 가로채거나 저장 요소·지우기 판정을 바꾸지 않고 복수 접촉·종료·취소 시 기존 정책대로 숨긴다.
- 줌 범위는 `canvasConstants.ts`의 10%~500%를 휠·터치 핀치·저장 뷰포트 복원에서 공유한다. 10%는 전체 배치 탐색용이며 세밀한 필기는 확대 후 수행한다.
- 빠른 `pointerdown`-`pointerup` 사이의 그리기 여부는 동기 ref가 소유한다. React state 반영 전에 종료된 짧은 획도 보존해야 한다.
- 펜슬 전용 그리기 상태의 한 손가락 터치는 이동 시작 방향을 판별한 뒤 X축 또는 Y축으로 잠긴다. 두 번째 손가락이 닿으면 기존의 자유 이동·핀치 확대 제스처로 전환한다.
- 선은 `useDrawing`, 이미지와 텍스트는 `useElementManipulation`이 소유한다.
- `useCanvasRendering`은 Konva의 정적/활성/오버레이 레이어를 재사용하고 `deleted` 요소를 렌더 입력에서 제외한다.
- 정적 요소는 현재 뷰포트의 폭과 높이를 각각 150%로 확장한 월드 좌표 렌더 윈도우 안에서만 Konva 노드를 유지한다. 여유 영역은 화면의 각 방향으로 25%다.
- 이동 중 현재 뷰포트가 렌더 윈도우 안에 있으면 transform만 갱신한다. 경계를 벗어나거나 확대율·뷰포트 크기가 바뀌면 공간 인덱스를 다시 검색하고 범위 밖 선·이미지·텍스트 노드를 제거한다.
- 연속 입력의 렌더 요청은 animation frame 하나로 합쳐 최신 상태만 처리하며, 컴포넌트 해제 시 예약된 frame을 취소한다.
- 저장된 선 좌표는 수정하지 않고 렌더링 시 끝점을 보존하는 Chaikin 보간을 한 번 적용한다. Konva tension은 끝점 오버슈트와 짧은 획 되말림 때문에 사용하지 않는다.
- 정적 선의 보간 결과는 좌표 배열 단위로 캐시하고, 비정상적으로 큰 선은 렌더 점을 최대 12,000개로 제한한다. 작성 중인 선은 최신 입력을 즉시 보간한다.
- `CanvasSpatialIndex`와 `canvasSelectionModel`도 `deleted` 요소를 선택 후보에서 제외한다.

## 상태와 히스토리

요소 상태는 `new | modified | deleted | unchanged`다.

- `new` 요소 삭제: 서버에 존재하지 않으므로 배열에서 즉시 제거한다.
- `unchanged` 또는 `modified` 요소 삭제: 배열에 `deleted` tombstone으로 남긴다.
- 삭제에는 `removeOrMarkDeleted()`를 사용한다. `markModified()`는 삭제 함수가 아니며 `deleted`를 전달하면 `modified`로 바꾸므로 삭제 경로에서 사용하지 않는다.
- 지우개와 올가미 삭제는 같은 삭제 함수를 사용해야 렌더 상태와 `deletedLines`/`deletedImages`/`deletedTextBoxes` payload가 일치한다.
- 변경 전에 `recordHistory()`를 호출하고 undo는 서버 저장 여부를 고려해 상태를 복원한다.
- 올가미 복사 데이터는 화면 컴포넌트가 아니라 앱 세션 메모리에 둔다. 목록을 거쳐 다른 캔버스로 이동해도 선·이미지·텍스트를 붙여넣을 수 있으며, 붙여넣은 요소는 새 ID와 `new` 상태를 가진다.

## 이미지와 PDF

- 이미지 파일과 클립보드 이미지는 자산 API에 업로드한 뒤 캔버스 이미지 요소로 추가한다.
- PDF는 브라우저의 PDF.js로 페이지별 PNG를 만든 뒤 이미지 요소로 업로드한다. 원본 PDF 객체를 직접 수정하지 않는다.
- 한 번에 가져오는 PDF는 최대 30페이지이며, 각 페이지의 긴 변은 최대 1,600px로 렌더링한다.
- 가져온 이미지와 PDF 페이지는 올가미로 이동, 확대·축소, 색상 틴트, 레이어 순서 변경, 복사, 삭제할 수 있다.
- 여러 페이지는 현재 화면 중앙부터 아래쪽으로 배치하며 가져오기 진행·완료·실패 상태를 화면에 표시한다.

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
- 툴바의 저장 상태는 아이콘으로만 표시하고 동적 메시지는 `title`, `aria-label`, `role=status`로 제공한다.

## 툴바 컨트롤

- 협소한 화면은 현재 도구만 표시하고 펼치기 버튼으로 도구 목록을 연다. 도구 선택, 바깥 터치, `Escape` 후에는 목록을 닫는다.
- 펜 색상 목록은 상시 공간을 차지하지 않는다. 펜 버튼을 누르면 팔레트 dialog가 열리고 색을 고르면 닫힌다.
- 현재 펜 색은 펜 버튼 아래의 작은 색 점으로 표시한다.
- 팔레트는 바깥 영역 또는 `Escape`로 닫히며 키보드와 터치 입력에서 같은 상태를 사용한다.
- 확대율과 화면 중앙 좌표는 안전 영역을 고려해 viewport 왼쪽 아래에 `fixed`로 표시한다.
- 목록 이동은 호박색 사각 격자 아이콘, 실행 취소는 도구 그룹 안의 원형 회전 아이콘으로 표시해 두 동작의 형태와 색을 구분한다.
- 제목 영역을 누르면 인라인 입력으로 바뀌며, 저장 시 문서 PATCH API를 호출해 목록과 상세 제목을 함께 갱신한다.

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
node scripts/deploy-cloud.mjs release all
```

클라우드 저장·재조회·목록 회귀는 `flownote/e2e-cloud/cloud.spec.ts`가 배포된 staging에서 담당한다.

## 관련 문서

- `ARCHITECTURE.md`
- `docs/FRONTEND.md`
- `docs/RELIABILITY.md`
- `docs/DEPLOYMENT.md`
- `logs/bugs/2026-08-26-canvas-lasso-delete-status.md`


## 라이브러리 디자인 갱신 (2026-10-20)

CanvasList는 카드 그리드 대신 폴더 트리와 파일 상세 목록을 사용한다. 사용자 명칭은 캔버스·노트이며 공통 색상·파일 동작·반응형 기준은 [작업 공간 디자인](workspace-explorer-design.md)을 따른다. 기존 API와 저장된 캔버스/폴더를 그대로 사용한다.


## 2026-10-26 공통 목록과 상태 UI

`CanvasList`는 호환 이름을 유지하는 노트·캔버스 공통 목록이다. `/canvas`와 `/blog` 목록이 이 UI를 공유하고 상세 경로는 보존한다. `features/workspace`의 종류+ID 키로 파일을 구분하고 기존 Canvas/Notes summary·folder API를 병렬 사용한다. 노트의 후속 페이지가 느려도 먼저 도착한 파일 메타를 표시한다. 저장 상태는 회색·배경/그림자 없음·완료 시 단순 Check이며 Toolbar의 전체 화면 버튼은 제거한다. 실제 신규 배포 여부는 [실행 계획](../../exec-plan/active/2026-10-26-workspace-library-ux.md)을 따른다.
