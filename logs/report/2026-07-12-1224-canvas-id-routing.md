# 캔버스 URL(id) 라우팅: /canvas 목록 + /canvas/:canvasId 편집기

- 일시: 2026-07-12 12:24 (로컬)
- 브랜치: `feat/canvas-id-routing`
- 목표(/goal): 그림판 id를 라우터 주소로 구분(멀티 캔버스 대비). 첫 진입 시 `/canvas`에 목록, 리스트 클릭 시 `/canvas/[canvas_id]`.

## 변경

프론트엔드 라우팅 전용 변경(서버 코드 변경 불필요 — 아래 참고).

- **신규 `flownote/src/widgets/CanvasWidget/CanvasList.tsx`**: 그림판 목록 페이지. 문서 그리드(제목·수정시각), 카드 클릭→`/canvas/:id`, "새 캔버스" 생성→새 id로 이동, 2단계 삭제, 로딩/빈/오류 상태.
- **`src/app/routers/Canvas/list.tsx`**(신규): `/canvas` → CanvasList.
- **`src/app/routers/Canvas/route.tsx`**: `/canvas/:canvasId` → `<CanvasWidget key={canvasId} />`. canvasId 변경 시 리마운트해 해당 캔버스를 새로 연다.
- **`src/app/capabilityManifest.tsx`**: canvas capability를 두 라우트로 분리(`/canvas`, `/canvas/:canvasId`). 헤더 나브 `/canvas`는 그대로 목록 진입점.
- **`Canvas.tsx`**: `useParams`로 `routeCanvasId`를 lazy 초기값에 반영, `selectedCanvasId`→URL 단방향 이펙트(편집기 내 전환 시 `navigate('/canvas/:id')`). URL→상태는 route.tsx의 key 리마운트로 처리.
- **exports**: `widgets/index.ts`, `CanvasWidget/index.ts`에 CanvasList 추가.

## "서버 변경" 판단

실제 서버 코드 변경은 없었다. 이유:
- Go 캔버스 백엔드(`flownote-canvas`)는 이미 `canvasId`를 path/query로 받는다.
- 딥링크(`/canvas/:id` 새로고침)는 이미 SPA 폴백이 처리: Vercel `vercel.json` rewrites, 로컬 `flownote/nginx.conf` `try_files … /index.html`.
- 프론트가 URL의 canvasId를 선택 캔버스로 사용하므로 API 호출은 그대로 올바른 캔버스를 가리킨다.

## 검증

- `yarn build` ✅, `npx tsc -b` 32(기준선 동일), 신규 파일 lint 클린.
- 프로덕션 딥링크: `GET /canvas` 200, `GET /canvas/<id>` 200(SPA `<title>Flownote</title>` 서빙) — 새로고침·직접 접근 동작.
- Vercel production 배포 `dpl_D9xnBESono9XP6qgSQkseUEvnNr8` READY.

## 수동 확인 권장(헤드리스 불가)

- 로그인 후 `/canvas` 목록 렌더 → 카드 클릭 → `/canvas/:id` 편집기가 해당 캔버스를 로드하는지.
- 편집기 내 라이브러리 패널에서 다른 캔버스 선택 시 주소가 `/canvas/:newId`로 바뀌는지, 뒤로가기 동작.
- "새 캔버스" 생성 후 새 id로 이동, 삭제 후 목록 갱신.

## 후속

- 편집기 내 라이브러리 패널과 목록 페이지의 기능 중복(둘 다 문서 목록). 추후 통합 여지.
- 멀티 캔버스 동시 편집/공유 시 URL 기반 구조가 기반이 됨(이번 변경의 목적).
