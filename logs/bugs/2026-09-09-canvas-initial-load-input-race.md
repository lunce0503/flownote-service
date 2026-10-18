# 캔버스 최초 입력 유실

## 증상

Vercel staging 배포 직후 cloud E2E에서 선이 화면 상태에는 잠시 추가되지만 30초 동안 서버에 저장되지 않았다. Railway에는 해당 canvas의 반복 `GET /api/canvas/load`만 있고 `canvas_save_started`가 없었다.

## 원인

1. 상세 화면이 보인 직후 최초 `canvas:load`가 완료되기 전에 사용자가 그릴 수 있었다. 먼저 생성된 로컬 선을 뒤늦게 도착한 빈 원격 snapshot이 덮어썼다.
2. 빠른 획은 `pointerdown`의 `setIsDrawing(true)`가 렌더에 반영되기 전에 `pointerup`이 이전 `isDrawing=false` 클로저를 읽어 종료 로직을 건너뛸 수 있었다.
3. 첫 Vercel 검증 실행에서는 별칭 갱신 직후 CSS 자산이 준비되지 않은 화면도 관찰됐다. 배포 스모크가 HTML만 확인해 자산 준비를 보장하지 못했다.

## 수정

- 최초 로드 중 input canvas를 `data-ready=false`, `pointer-events:none`으로 잠근다.
- 포인터 상태 머신은 동기 ref로 획 시작과 종료를 판정한다.
- cloud E2E는 입력 준비와 로컬 선 생성을 각각 검증한다.
- 배포 스모크는 Vercel HTML이 참조하는 JS/CSS 자산이 모두 2xx가 될 때까지 제한적으로 재시도한다.

## 검증

최종 staging cloud E2E와 production 배포 결과는 `logs/report/2026-09-09-0027-cloud-only-staging.md`에 기록한다.
