# 노트 '전체로 보기' 버튼 (브라우저 UI + 헤더 숨김)

- 일시: 2026-07-17 08:28 (로컬)
- 브랜치: `design/toolbar-overlay`(c5db97f, 푸시 완료) — 툴바 오버레이와 함께 main 미병합(디자인 확인 대기)
- 요청: 웹에서 노트 이용 시 영상 전체 화면처럼 브라우저 툴바와 Flownote 헤더를 숨기는 "전체로 보기" 버튼

## 구현 (3개 파일, +72/−1)

- `shared/lib/useFullscreen.ts`(신규): Fullscreen API 훅. `document.documentElement.requestFullscreen()`으로 브라우저 툴바·주소창 숨김, iPadOS Safari용 `webkitRequestFullscreen`/`webkitfullscreenchange` 폴백, 상태 동기화, 미지원·제스처 밖 호출은 조용히 무시(Esc로 항상 종료 가능).
- `app/App.tsx`: 전체 화면 동안 `shouldShowHeader`에 조건 추가 — **Flownote 헤더도 함께 숨김**. 훅 기반이라 어느 화면에서 전체 화면을 켜도 일관 동작.
- `pages/BlogDetailPage/index.tsx`: 우하단 고정 플로팅 토글 버튼(영상 플레이어 관례 위치). `Maximize2`/`Minimize2` 아이콘 + "전체로 보기"/"전체 보기 종료" 라벨, `aria-pressed`, stone-900 필 스타일(디자인 시스템 일치).

## 검증·배포

- `yarn build` ✅ · tsc 32 · lint 84(기준선) · compose 11컨테이너
- Vercel production `dpl_GS4qD544oAKhh4P7JNZ6pWDu2ocj` READY, https://flownote-react.vercel.app 200
- Railway 생략 사유: 프론트 전용 변경

## 참고

- iPhone Safari는 요소 전체 화면 API를 지원하지 않아 버튼이 동작하지 않을 수 있음(iPad·데스크탑은 지원). 필요 시 iPhone은 홈 화면 추가(standalone PWA)가 대안.
- 캔버스 화면에도 같은 훅을 재사용해 전체 화면 버튼을 붙일 수 있음(후속 후보).
