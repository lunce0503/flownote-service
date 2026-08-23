# 전체화면 버튼 노출 수정 + 캔버스 레이어(z-index) 순서 변경 기능

- 일시: 2026-07-18 13:19 (로컬)
- 브랜치: `design/toolbar-overlay` (툴바 오버레이·전체보기 계열, main 미병합)
- 요청: ① 전체화면 버튼이 안 보이는 문제를 z-index 관점에서 확인·수정 ② 캔버스에서 요소의 z-index(레이어 순서)를 바꾸는 기능 추가
- 영향 범위: `flownote/` (프론트 전용). 백엔드/DB 변경 없음.

## 1. 전체화면 버튼이 보이지 않던 원인 분석

코드·번들·라우팅을 모두 검증한 결과:

- 배포 번들에 버튼 문자열("전체로 보기") 존재 확인 → 코드는 배포됨.
- 라우팅 정상: `/blog/:title`(라벨 '게시글' = 노트) → `BlogDetail` → `BlogDetailPage`. `renderRoute`가 children 재귀 렌더 확인.
- **트랩 조상 없음**: `.App`/`#root`/`body`/`ThemeProvider`에 `transform`/`filter`/`overflow` 등 `position: fixed` 컨테이닝 블록을 만드는 속성 없음 → 이론상 `fixed z-50`은 뷰포트 우하단에 떠야 함.
- 남은 실질 원인: **브라우저 캐시 잔존** 또는 특정 기기에서 상위 레이어(헤더 `z-[1000]`, Mantine/BlockNote 포털)와의 겹침 가능성.

## 2. 전체화면 버튼: 캔버스(그림판) 툴바에 추가 — 실제 대상 규명

**핵심 오해 해소**: 사용자의 "노트"는 게시글(BlockNote `/blog/:title`)이 아니라 **캔버스(그림판, `/canvas/:id`)**였다. 학습 필기 캔버스를 노트처럼 쓰는데, 전체화면 버튼을 계속 게시글 페이지에만 넣어 정작 캔버스 화면에서는 보이지 않았다(스크린샷 `logs/bugs/image.png`로 확인). "툴바에 넣어달라" = **캔버스 상단 플로팅 툴바**를 의미.

- `widgets/CanvasWidget/InfiniteCanvas/ui/Toolbar.tsx`: 우측 클러스터(저장/불러오기/설정)의 설정 톱니 **바로 앞에** 전체화면 토글 버튼 추가. `useFullscreen` 훅 직접 사용, `Maximize`/`Minimize`(전체화면 브래킷) 아이콘, 활성 시 `selectedIconButtonClass`, `touchActivation`로 펜/터치 탭 처리, `title`·`aria-label`·`aria-pressed` 접근성.
- 노트(게시글) 쪽 버튼도 유지: `widgets/BlogWidget/BlockNote/BlockNote.tsx`의 note-header에 인라인 "전체로 보기" 버튼(이전 단계). 두 노트 표면 모두에서 동작.
- `pages/BlogDetailPage/index.tsx`: 플로팅 포털 버튼 제거 → BlockNoteWidget만 렌더하는 단순 래퍼.
- `app/App.tsx`의 전체화면 중 Flownote 헤더 숨김(`useFullscreen`)은 유지 — 훅이 `fullscreenchange`로 인스턴스 간 상태 동기화하므로 캔버스/노트 어디서 켜도 헤더가 함께 숨는다.
- 재배포로 번들 해시가 바뀌어 캐시 잔존 시나리오도 함께 해소.

## 3. 캔버스 레이어(z-index) 순서 변경 기능

### 핵심: 백엔드/마이그레이션 0

flownote-canvas(Go)는 요소 payload를 `json.RawMessage`로 **패스스루** 저장(`canvas_elements.payload::jsonb`, `canvas_documents.*::jsonb`). 요소 JSON에 필드를 더해도 그대로 저장·반환되므로 **DB 컬럼/마이그레이션/Go 변경 없이** `zIndex`가 저장→로드 왕복한다.

- 저장: `serializeLine/serializeImage/serializeTextBox`가 rest-spread → `zIndex` 포함.
- 백엔드: JSONB 패스스루.
- 로드: `{ ...el, status }` + `hydrateImageElement`가 spread → `zIndex` 보존.

### 변경 파일

- `entities/canvas/model/types.ts`: `LineElement`/`ImageElement`/`TextBoxElement`에 `zIndex?: number` 추가(클수록 앞, 미지정은 배열 순서).
- `features/canvas/model/useCanvasRendering.tsx`:
  - `staticGroup`을 **imageGroup(아래) → lineGroup(위)** 두 하위 그룹으로 분리. "이미지 밑, 필기 위" 기본 층위를 유지하면서 이미지끼리·선끼리만 재정렬(서로 z-order 침범 방지).
  - `reconcileImages/Lines/Texts` 각각 `sortByZIndex` + `applyLayerOrder`(id 시그니처가 같으면 재정렬 스킵)로 각 그룹 내 Konva `zIndex` 동기화.
  - 기존 이미지 `moveToBottom()`(배열 역순으로 쌓이던 동작) 제거 → 기본 순서가 **배열 순서(나중 추가가 위)**로 직관화. 텍스트는 별도 overlay 레이어라 항상 최상단(기존 유지).
- `widgets/CanvasWidget/InfiniteCanvas/model/useLassoActions.ts`: `bringToFront`/`sendToBack` 순수 헬퍼 + `handleBringLassoSelectionToFront`/`handleSendLassoSelectionToBack`. 선택 요소를 같은 타입 요소들의 max+1.. / min-1.. 로 재배치하고 `markModified`(→ 저장·되돌리기 반영). 선택끼리 상대 순서 유지, 선택 해제 안 함(연속 조작 가능).
- `ui/Canvas.tsx`: 두 핸들러 구조분해 + Toolbar prop 연결.
- `ui/Toolbar.tsx`: 라쏘 액션 바에 `BringToFront`("맨 앞으로 가져오기")·`SendToBack`("맨 뒤로 보내기") 버튼 추가.

### 사용 흐름

올가미로 이미지/텍스트/선 선택 → 라쏘 액션 바의 "맨 앞으로/맨 뒤로" → 같은 타입 내에서 즉시 재정렬, 자동 저장. 되돌리기(undo) 지원.

### 설계상 층위 모델(문서화)

전역 단일 z-index가 아니라 **타입별 층위 고정 + 타입 내 재정렬**: 이미지 < 필기(선) < 텍스트. 필기/라벨이 이미지 위에 유지되는 것이 필기 앱의 기대와 일치하며, 겹치는 이미지끼리의 순서 제어(주 사용처)를 완전히 커버한다.

## 검증

- `npx tsc -b`: 32 (기준선 동일, 신규 타입 오류 0)
- `yarn build`: ✅ (`dist/assets/index-BeFvh9BC.js`)
- `yarn lint`: 84 problems (기준선 동일)
- `docker compose up -d --build` (REDIS_HOST_PORT=6380): ✅ 빌드 exit 0, 전 이미지 빌드·기동. 이번 변경 관련 서비스(react/api/canvas/serve) 모두 running.
  - 단, `ai-server`는 `sh: uvicorn: not found`로 재시작 반복 — **flownote-ai 이미지의 사전 존재 이슈**(이번 프론트 전용 변경과 무관, flownote-ai 미수정).
- Vercel production 배포: 최종 `dpl_BkGXsPdXJm6fPmrfaGS4BeoQoFHK` READY → https://flownote-react.vercel.app (200). 신 번들 `/assets/index-83D7jyYp.js`에 캔버스 툴바 "전체 화면"·"맨 앞으로 가져오기" 문자열 포함 확인.
- Railway: 프론트 전용 변경이라 생략(백엔드 실행 산출물·계약 변경 없음).

## 후속 후보

- 이미지 `moveToBottom` 제거로 기존 캔버스에서 겹친 이미지의 기본 표시 순서가 배열 순서로 바뀔 수 있음(대부분 겹침이 없어 영향 미미, 필요 시 레이어 버튼으로 조정 가능).
- 단일 요소 탭 선택 + 인라인 레이어 컨트롤(현재는 올가미 선택 기반).
- "한 단계 앞/뒤"(forward/backward) 단계 이동 버튼.
