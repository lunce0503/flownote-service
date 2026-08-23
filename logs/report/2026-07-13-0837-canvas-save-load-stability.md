# 캔버스 저장/로드 기기 의존 불안정 수정 (큐·스택 진단)

- 일시: 2026-07-13 08:37 (로컬)
- 브랜치 흐름: `fix/canvas-load-problem`(71386d3) → `release/prod` 머지(8b083e3) → `main` fast-forward → 전부 푸시
- 증상: 프론트 로드·저장이 클라이언트 기기에 따라 다르게 동작. 아이패드 필기 환경에서 두드러짐.

## 진단 — 큐/스택 관점 결함 4건

파이프라인: 요소 dirty 추적 → 800ms 디바운스 자동 저장 → 소켓 `canvas:save`(mutationId 멱등) → 실패 시 캔버스별 1항목 재시도 큐(IndexedDB 영속, 지수 백오프, 5s 폴링) → 로컬 초안(IndexedDB) → 로드 시 초안/서버 revision 비교. undo는 명령 스택(50개 제한, 로드 후 clear)로 건전.

| # | 결함 | 기기 의존 원인 | 영향 |
| --- | --- | --- | --- |
| 1 | **하이드레이션 경합**: IndexedDB 큐 복원이 메모리 큐를 통째로 교체 | IndexedDB 열기가 느린 기기(아이패드 콜드 스타트)에서 복원 전에 실패 항목이 쌓임 | 세션 초반 실패 저장 유실 |
| 2 | **큐 오귀속**: in-flight 저장 실패 시 `canvasIdRef.current`(전환 후 값)로 큐 등록 | 저장 왕복이 긴 네트워크에서 캔버스 전환과 겹침 | 이전 캔버스 요소가 **다른 캔버스에 기록**(교차 오염), 성공 경로에선 새 캔버스 큐 오삭제 |
| 3 | **방 재참여 없음**: `canvas:join`을 마운트 시 1회만 emit | 아이패드 절전→복귀 시 소켓 재연결되나 서버 room 멤버십 소멸 | 원격 변경 수신 영구 중단 → "기기마다 로드가 다름"의 직접 원인 |
| 4 | **백오프 상속**: 큐 항목 갱신 시 `nextAttemptAt`/`attempts` 유지 | 이전 실패가 잦은 불안정 네트워크 | 새 변경이 최대 5분 재시도 지연 |

## 수정 (2개 파일, +57/−18)

- `canvasLocalDraft.ts`: `hydrateCanvasRetryQueue` — 캔버스별 병합(메모리 우선, 병합 결과 즉시 재영속화). `addCanvasRetryQueueItem` — payload 변경 시 `attempts: 0`, `nextAttemptAt: now` 리셋.
- `usePersistence.tsx`: `handleSave` — 루프 반복마다 `attemptCanvasId` 캡처, 저장/큐 귀속/revision 반영/`clearCanvasRetryQueue`/진단 기록 전부 그 캔버스에만 적용, 전환 감지 시 커밋 생략 후 재루프. 소켓 join 이펙트 — `connect` 핸들러에서 재참여 + (로컬 보류 변경 없을 때) `handleLoad("remote")` 1회 캐치업, 정리 시 `off("connect")`.

## 검증

- `yarn build` ✅ (11.7s) · `npx tsc -b` 32건(수정 전 기준선과 동일, 신규 0) · `yarn lint` 84건(동일)
- `REDIS_HOST_PORT=6380 docker compose up -d --build` → 10개 컨테이너 Up
- 수동 스모크 권장: 아이패드에서 ① 필기 중 홈 화면 이탈→복귀 후 다른 기기 변경 수신, ② 비행기 모드에서 필기→저장 실패→새 필기 추가→온라인 복귀 시 즉시 재시도, ③ 저장 중 캔버스 전환 후 양쪽 캔버스 내용 무결성

## 배포

- Vercel production: `dpl_9PtdJnzq9ogrNsDfea3yiotA83f7` READY, https://flownote-react.vercel.app 200
- Railway 생략 사유: 백엔드(flownote-server·flownote-canvas·flownote-API·flownote-ai) 파일 변경 없음 — 프론트 전용 수정
