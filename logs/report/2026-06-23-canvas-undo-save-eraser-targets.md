# 그림판 undo 저장 및 지우개 대상 토글 작업 보고서

작성일: 2026-06-23

## 변경 사항

- [useCanvasHistory.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useCanvasHistory.tsx)
  - undo로 저장 가능성이 있는 요소를 제거할 때 `deleted` tombstone을 남긴다.
  - undo로 기존 요소를 이전 상태로 되돌릴 때 저장 payload에 반영되도록 `modified` 상태를 적용한다.
- [usePersistence.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/usePersistence.tsx)
  - 저장 재시도 큐 전송 직전에 현재 dirty payload와 비교한다.
  - stale retry payload는 최신 payload와 새 `mutationId`로 교체한다.
  - 현재 변경이 없으면 오래된 retry 항목을 제거한다.
- [useDrawing.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useDrawing.tsx)
  - 선 지우기 대상 활성 여부를 인자로 받는다.
- [useElementManipulation.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useElementManipulation.tsx)
  - 이미지, 텍스트 박스 지우기 대상을 개별 옵션으로 받는다.
- [canvasConstants.ts](/home/kwon/Flownote/service/flownote/src/features/canvas/model/canvasConstants.ts)
  - 지우개 대상 localStorage key를 추가했다.
- [Canvas.tsx](/home/kwon/Flownote/service/flownote/src/widgets/CanvasWidget/InfiniteCanvas/ui/Canvas.tsx)
  - 설정 패널에 `선`, `이미지`, `텍스트 박스` 지우개 대상 토글을 추가했다.
  - 지우개 동작 시 토글된 대상만 삭제한다.

## 검증

- `yarn tsc --noEmit`: 성공.
- `yarn build`: 성공.
- `git diff --check`: 성공.
- `docker compose up -d --build`: 이미지 빌드 성공, 전체 기동은 외부 Redis 포트 충돌로 실패.
- `docker compose up -d --no-deps react-app`: 성공.
- `curl http://localhost:5173/`: `200`.

## 클라우드 배포

- Vercel production deployment: `dpl_8AhLGSKcB4KBKnypp7M8Roh6DbY1`
- 배포 URL: `https://flownote-react-3crba79m9-flownote-service.vercel.app`
- 운영 alias: `https://flownote-react.vercel.app`
- Railway: 백엔드 변경 없음으로 생략.

## 남은 참고 사항

- Docker 전체 기동 실패 원인은 현재 호스트의 `village-finance-redis` 컨테이너가 `6379`를 점유한 것이다.
- 전체 compose 검증이 필요하면 해당 외부 컨테이너를 중지하거나 Redis 호스트 포트 매핑을 조정한 뒤 다시 실행해야 한다.
