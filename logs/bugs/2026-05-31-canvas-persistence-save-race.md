# Canvas persistence save race

## 증상

- 그림판 저장 또는 재시도 저장 중 추가 변경이 발생하면 저장 완료 처리와 최신 변경 처리 순서가 엇갈릴 수 있다.
- 페이지 숨김/이탈 직전 `handleFlushSave`가 성공해도 로컬 초안에는 `new`/`modified` 상태가 남아 다음 로드에서 이미 저장된 내용을 다시 pending 초안으로 적용할 수 있다.

## 원인

- 일반 저장, 재시도 저장, 페이지 이탈 저장이 각각 저장 성공 후 상태 정리 로직을 다르게 처리했다.
- 재시도 저장은 별도의 in-flight 보호 없이 실행되어 일반 저장과 동시에 서버 요청을 보낼 수 있었다.
- 저장 성공 후 `drawnLines`/`images`/`textBoxes`의 ref와 로컬 초안을 즉시 `unchanged` 상태로 동기화하지 않는 경로가 있었다.

## 수정 방향

- 저장 성공 상태 정리를 `commitSavedCanvasState`로 통합했다.
- 재시도 저장도 `saveInFlightRef`를 통해 동시 저장을 막고, 재시도 중 변경이 생기면 성공 커밋 대신 다음 저장을 예약하도록 변경했다.
- 페이지 이탈 저장 성공 시에도 로컬 상태와 로컬 초안을 `unchanged`로 정리해 다음 로드에서 오래된 pending 초안이 우선 적용되지 않게 했다.

## 검증

- `flownote/`에서 `yarn build` 성공.
- 저장소 루트에서 `docker compose up -d --build` 성공.
