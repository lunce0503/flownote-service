# Canvas buffered rendering

## 변경 목적

캔버스 이동과 확대·축소 중 화면 밖 요소까지 계속 Konva 노드로 유지하거나 매 프레임 전체 요소를 순회하는 비용을 줄인다.

## 구현

- 현재 뷰포트의 폭과 높이를 각각 150%로 확장한 월드 좌표 렌더 윈도우를 사용한다.
- 이동 중 뷰포트가 기존 렌더 윈도우 안에 있으면 Konva 그룹 transform만 갱신한다.
- 뷰포트가 윈도우를 벗어나거나 확대율·화면 크기가 바뀌면 `CanvasSpatialIndex`를 검색한다.
- 렌더 윈도우 밖의 선, 이미지, 텍스트 Konva 노드는 제거한다.
- 요소 배열이 실제로 바뀔 때만 공간 인덱스를 재생성하도록 로컬 선과 원격 스트리밍 선의 합성 배열을 메모이제이션한다.
- 연속 렌더 요청은 기존 animation frame 큐에서 최신 상태 하나로 합쳐진다.

## 검증

- `cd flownote && yarn typecheck`: 통과
- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn build`: 통과
- Node 수치 검증: 1000x800 뷰포트가 `-250..1250 x -200..1000`으로 확장되고, 버퍼 내부 이동과 경계 이탈을 올바르게 판별함

## 배포 상태

- 스테이징 Vercel: `dpl_6i85yyPLdbSMBPLUpGefpsEpUbzG` (`READY`)
- 스테이징 클라우드 E2E: 11개 통과
- 프로덕션 Vercel: `dpl_HNErtoN9KJjNzeezpYzs6swF9onX` (`READY`)
- 운영 웹 `https://flownote-react.vercel.app/`: HTTP 200
- 운영 Gateway `/`: HTTP 200
- 운영 Gateway `/api/users/me`: 비인증 기준 HTTP 401

첫 스테이징 스모크 체크는 Gateway와 Spring 서비스가 동시에 콜드 스타트하는 동안 일시적으로 502를 반환해 중단됐다. Spring 기동 완료 후 같은 엔드포인트가 정상 401로 복구됐고, 기존 스테이징 웹 배포를 유지한 채 E2E와 프로덕션 승격을 완료했다.
