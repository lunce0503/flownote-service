# 캔버스 툴바 플로팅 오버레이 전환

- 일시: 2026-07-17 03:25 (로컬)
- 브랜치: `design/toolbar-overlay`(87e8ef5, main에서 분기·푸시) — **main 미병합**(디자인 확인 대기)
- 요청: 툴바 div를 상단 바에서 분리해 폴더 목록(CanvasLibraryPanel)처럼 캔버스 컴포넌트 위에 띄우는 디자인 변경

## 변경 (3개 파일, +40/−38)

- `Toolbar.tsx`: 루트를 `absolute inset-x-2 top-2` 중앙 정렬 필 클러스터로 전환. 풀폭 스트립(border-b·bg-stone-50) 제거 — 필 사이 빈 공간은 `pointer-events-none`으로 캔버스 입력을 통과시킨다. 행은 `w-max` 중앙 정렬, 넘칠 때만 가로 스크롤. sticky 우측 클러스터·배경 패치 제거.
- `Canvas.tsx`: `<Toolbar/>`를 뷰포트 div 내부로 이동 — 캔버스가 툴바 높이(~64/120px)만큼 작업 영역을 되찾음.
- `CanvasLibraryPanel.tsx` + 설정 패널: `top-4`→`top-20`으로 내려 플로팅 툴바 아래 정렬(폴더 패널 max-height 보정 포함).
- 유지: 라쏘 오버레이(top-full), 터치 활성화(touchActivation), lg 한 줄/미만 두 줄 반응형, 단축키.

## 검증·배포

- `yarn build` ✅ · tsc 32 · lint 84(기준선) · compose 11컨테이너
- Vercel production `dpl_3jmHcPx4DQudBYZm9KR7afjc4D8c` READY, https://flownote-react.vercel.app 200 — **프로덕션에 새 디자인 반영됨**(브랜치 작업 트리 기준 배포)
- Railway 생략 사유: 프론트 전용 변경

## 후속

- 실기기(아이패드) 확인 권장: 필기 중 상단 필 사이 빈 공간으로 그리기가 통과하는지, 두 줄 모드에서 패널과의 간섭.
- 디자인 확정 시 `design/toolbar-overlay` → release/prod → main 병합. 되돌리려면 main 재배포로 즉시 롤백 가능.
