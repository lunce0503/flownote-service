# 2026-06-23 그림판 undo 저장 및 지우개 대상 설정

## 증상

- 되돌리기 후 서버 저장이 되지 않은 삭제 상태가 남아, 다시 불러오면 사라졌던 선이 다시 나타날 수 있었다.
- 지우개는 선, 이미지, 텍스트 박스를 항상 함께 대상으로 삼아 선택적으로 지우기 어려웠다.

## 원인

- undo가 추가된 요소를 단순히 배열에서 제거하면, 이미 서버 저장 또는 재시도 큐에 들어간 요소에 대한 삭제 tombstone이 저장 payload에 포함되지 않았다.
- 저장 재시도 큐는 실패 당시 payload를 우선 전송해 undo 이후 최신 상태와 어긋날 수 있었다.
- 지우개 대상은 함수 호출부에서 고정되어 있었다.

## 수정

- undo에서 서버에 저장됐을 가능성이 있는 요소를 제거할 때 `deleted` tombstone을 남기도록 변경했다.
- undo로 기존 요소 위치/내용을 되돌릴 때 `modified` 상태가 저장 payload에 포함되도록 보정했다.
- 저장 재시도 큐는 전송 직전에 현재 dirty payload와 비교하고, 다르면 최신 payload와 새 `mutationId`로 교체한다.
- 현재 dirty payload가 비어 있으면 오래된 재시도 항목을 제거한다.
- 지우개 대상 설정을 선, 이미지, 텍스트 박스별 localStorage 토글로 추가했다.
- 실제 지우기 함수는 켜진 대상만 처리하도록 변경했다.

## 검증

- `flownote`: `yarn tsc --noEmit` 성공.
- `flownote`: `yarn build` 성공.
- `git diff --check` 성공.
- `docker compose up -d --build`는 이미지 빌드까지 성공했으나 외부 `village-finance-redis`가 `6379` 포트를 사용해 전체 기동은 실패했다.
- 변경 대상인 `react-app`은 `docker compose up -d --no-deps react-app`로 실행했고 `http://localhost:5173/` 응답 `200`을 확인했다.
- Vercel production 배포 성공.

## 배포

- Vercel deployment: `dpl_8AhLGSKcB4KBKnypp7M8Roh6DbY1`
- Alias: `https://flownote-react.vercel.app`
- Railway 배포는 백엔드 코드/계약 변경이 없어 생략했다.
