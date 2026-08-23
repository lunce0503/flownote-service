# 캔버스 증분 동기화 + 재연결 즉시 재시도

- 일시: 2026-07-16 02:21 (로컬)
- 브랜치: `feat/canvas-incremental-sync`(c5f6555) → `release/prod`·`main`(85fd29d), 전부 푸시
- 배경: 데스크탑(이미지)+아이패드(필기) 동시 사용 시 상호 변경 미반영. 진단 결과 ① 데스크탑 구버전 번들(HTTP 직접, 브로드캐스트 없음 — 캐시 삭제로 해결해야 함), ② 아이패드 소켓 빈번 단절이 "재시도 대기+원격 변경 대기" 교착으로 증폭되는 클라이언트 구조. 본 작업은 ②의 구조 제거(재발 방지 2건).

## 구현

**1. 증분 동기화** (설계: 푸시 피기백)
- 게이트웨이(`canvas_socket.py`): `canvas:changed`에 `changes`(저장 payload 9배열) 포함. `CANVAS_CHANGED_MAX_INLINE_BYTES`(기본 256KB) 초과 시 생략 → 폴백. 구 클라이언트는 무시(하위 호환).
- 프론트(`usePersistence.tsx`): revision 연속(`serverRevision+1`) + changes 존재 + 로컬 보류 없음이면 `applyRemoteChanges` — 요소 id 기준 upsert(status unchanged)·삭제, 이미지는 플레이스홀더 후 `hydrateImageElement` 비동기 하이드레이션. 순차 처리 가드(`remoteApplyInFlightRef`)와 큐 연쇄 드레인. 갭·대형 mutation은 기존 전체 리로드.
- 효과: 원격 변경당 1.2MB 전체 로드(3~5s) → 수 KB 델타 즉시 적용. 대형 캔버스에서 `trigger=remote` SLOW 로그 소멸이 정량 지표.

**2. 재연결 즉시 재시도**
- `canvasLocalDraft.ts`: `resetCanvasRetryBackoff()` 신설.
- connect 핸들러: 재연결 시 해당 캔버스 재시도 큐 백오프 리셋 → `retryPendingSaves()` 즉시 실행 → 큐가 비면 원격 캐치업 로드. 기존 5초 폴링+최대 5분 백오프 대기 제거.
- 효과: 아이패드 소켓 단절 수 초가 수 분 교착으로 증폭되던 구조 제거. 서버가 이미 저장한 경우 멱등 duplicate로 첫 재시도에 즉시 성공.

## 검증

- pytest 12 ✅ · `yarn build` ✅ · tsc 32·lint 84(기준선, 신규 lint 2건은 ref 간접 호출·이펙트 할당으로 해소) · compose 10개 기동
- 배포 후 프로덕션 소켓 프로브: 세션 10s 유지 + `canvas:load` ack 왕복 정상(가짜 토큰 401)
- Railway `flownote-api` SUCCESS · Vercel `dpl_ARVLPHo6…` READY 200. flownote-canvas·flownote-main 미배포 사유: 코드 변경 없음.

## 남은 사용자 조치·관찰

- **데스크탑·아이패드 캐시 강력 새로고침 필수**(구버전 번들 제거) — 코드로 해결 불가한 1층 원인.
- 이후 실사용에서 관찰: 아이패드 "재시도 대기" 체류 시간(수 초 내 해소 기대), Go 로그의 `trigger=remote` SLOW 빈도(소멸 기대), 게이트웨이 `canvas_save_completed` 재등장(소켓 경로 복귀 증거).
- 후속 후보(2단계): 변경 요소 교집합 검사로 로컬 보류 중에도 비충돌 델타 적용(선 vs 이미지 병행 편집 즉시 반영).
