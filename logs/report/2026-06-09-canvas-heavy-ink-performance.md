# 그림판 대량 필기 성능 개선 보고서

작성일: 2026-06-09

## 적용 범위

- [useCanvasRendering.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useCanvasRendering.tsx)
  - static, active stroke, overlay의 3개 Konva layer 구성
  - line ID별 Konva node 유지 및 증분 갱신
  - group transform 기반 이동·확대
  - RBush viewport 검색과 화면 밖 선 visibility 제어
- [canvasSpatialIndex.ts](/home/kwon/Flownote/service/flownote/src/features/canvas/model/canvasSpatialIndex.ts)
  - 선, 이미지, 텍스트 bounding box 공간 인덱스
- [useDrawing.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useDrawing.tsx)
  - 지우개 주변 후보 선만 정밀 hit test
- [canvasSelectionModel.ts](/home/kwon/Flownote/service/flownote/src/features/canvas/model/canvasSelectionModel.ts)
  - 올가미 bounding box 후보만 polygon 검사
- [useCanvasHistory.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/useCanvasHistory.tsx)
  - 전체 snapshot 대신 `ADD_LINE`, `DELETE_LINE`, `MOVE_ELEMENT`, `BATCH_UPDATE` 차등 명령 저장
- [usePersistence.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/usePersistence.tsx)
  - 요소별 map과 dirty ID 기반 payload 구성
  - 자동 저장 800ms debounce
  - IndexedDB 초안 1.5초 debounce
  - 소켓 점 전송 animation frame batching
- [canvasDraftWorker.ts](/home/kwon/Flownote/service/flownote/src/features/canvas/model/canvasDraftWorker.ts)
  - 로컬 초안 구성과 pending 판정을 Worker에서 수행

## 기대 효과

- 필기 중에는 기존 수천 개 선의 Konva node를 다시 만들지 않는다.
- 화면 이동과 확대는 transform과 viewport visibility만 바뀐다.
- 지우개와 올가미의 정밀 계산 대상이 전체 요소에서 공간 후보로 줄어든다.
- 히스토리 메모리 사용량이 전체 캔버스 크기와 작업 횟수의 곱으로 증가하지 않는다.
- 저장과 초안 기록이 포인터 입력과 같은 프레임에서 반복 실행되지 않는다.
- 실시간 소켓 이벤트 수가 포인터 샘플 수가 아니라 화면 frame 수 수준으로 제한된다.

## 검증 결과

- `flownote/yarn build`: 성공
- `flownote/yarn tsc --noEmit`: 성공
- Worker asset: `dist/assets/canvasDraftWorker-*.js` 생성 확인
- 개발 서버: `http://localhost:5174/` 응답 `200`
- Docker: `docker compose up -d --build` 성공
- Docker React: `http://localhost:5173/` 응답 `200`
- Docker Spring: `http://localhost:8080/actuator/health` -> `UP`
- Docker FastAPI: `http://localhost:8000/docs` -> `200`

## 배포 결과

- Vercel deployment: `dpl_F18oJZrBKpkRPpG27H6MTaRR1LrZ`
- URL: `https://flownote-react-da4nnly1q-flownote-service.vercel.app`
- Production alias: `https://flownote-react.vercel.app`
- 백엔드 API와 저장 계약은 변경하지 않아 Railway는 재배포하지 않았다.

## 후속 측정

운영 iPad에서 선 4,000개 이상 그림판을 대상으로 Performance panel 없이도 관리자 진단에 다음 값을 추가하는 것이 좋다.

- pointer-to-frame 지연 p50/p95
- 프레임당 visible line 수
- RBush 후보 수와 실제 hit test 수
- 자동 저장 payload 요소 수
- 초안 Worker 처리 시간
