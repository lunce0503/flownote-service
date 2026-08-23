# 2026-06-09 대량 필기 그림판 렌더링 지연

## 증상

- 선이 많은 그림판에서 필기, 화면 이동, 확대·축소, 지우개 사용 시 입력 반응이 늦어졌다.

## 원인

- 선 또는 viewport가 바뀔 때마다 Konva layer의 모든 자식을 제거하고 전체 선을 다시 생성했다.
- 현재 작성 중인 선을 갱신할 때도 안정된 전체 선 배열을 순회했다.
- 지우개와 올가미가 모든 선과 모든 점을 순차 검색했다.
- 실행 취소 기록마다 전체 그림판을 깊은 복사해 최대 50개 snapshot을 유지했다.
- 상태 변경마다 전체 요소를 저장 payload로 재구성하고 IndexedDB 초안을 즉시 기록했다.
- 실시간 `line-points`가 포인터 이벤트 빈도로 소켓 전송됐다.

## 수정

- Konva를 `staticLayer`, `activeStrokeLayer`, `overlayLayer`로 분리했다.
- `Map<lineId, Konva.Line>`을 유지하고 추가·수정·삭제된 노드만 반영한다.
- 이동·확대 시 노드를 재생성하지 않고 group transform만 갱신한다.
- RBush로 viewport 밖 선을 숨기고 지우개·올가미 후보를 제한한다.
- 현재 필기는 active stroke layer만 animation frame 단위로 갱신한다.
- 실행 취소를 전체 snapshot 대신 변경 요소만 보관하는 명령 스택으로 변경했다.
- dirty ID 집합으로 저장 payload를 만들고 자동 저장을 800ms debounce했다.
- IndexedDB 초안은 1.5초 debounce하고 Worker에서 초안 객체를 구성한다.
- `line-points`는 한 animation frame의 점을 묶어서 전송한다.

## 검증

- `yarn build` 성공.
- `yarn tsc --noEmit` 성공.
- Vite가 `canvasDraftWorker` 별도 asset을 생성함.
- `docker compose up -d --build` 성공.
- Docker React `200`, Spring `UP`, FastAPI `/docs` `200` 확인.
- `git diff --check` 성공.

## 배포

- Vercel production deployment: `dpl_F18oJZrBKpkRPpG27H6MTaRR1LrZ`
- Production alias: `https://flownote-react.vercel.app`
- 백엔드 계약 변경이 없어 Railway 배포는 생략했다.
