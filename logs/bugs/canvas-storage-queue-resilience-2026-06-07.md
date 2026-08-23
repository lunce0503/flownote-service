# 캔버스 저장 및 불러오기 지연 장애

## 증상

- R2 요소 읽기나 쓰기가 느려지면 캔버스 저장과 불러오기 요청도 함께 지연됐다.
- PostgreSQL 장애 시 브라우저 재시도 데이터가 `localStorage` 용량 제한을 초과할 수 있었다.
- 메타데이터 조회 하나가 실패해도 선과 텍스트를 포함한 전체 불러오기가 실패했다.
- iPad처럼 개발자 콘솔 확인이 어려운 기기에서는 요청 큐와 저장소 상태를 확인하기 어려웠다.

## 원인

- Spring DB 트랜잭션 안에서 R2 요소 JSON을 동기 저장했다.
- 요소 읽기가 DB payload보다 R2 object를 우선했고, 이전 snapshot도 동기 조회했다.
- 클라이언트 큐가 `Set`과 boolean으로 축약되어 요청 원인과 우선순위를 보존하지 못했다.
- 로컬 초안과 재시도 큐가 용량 제한이 작은 `localStorage`에 저장됐다.

## 수정

- PostgreSQL `canvas_elements.payload`를 읽기 가능한 원본으로 유지한다.
- R2 반영은 `canvas_storage_jobs` outbox와 백그라운드 worker가 지수 백오프로 처리한다.
- 수동 저장, 수동 불러오기, 선택, 원격, 자동, 재시도 순으로 서버와 클라이언트 우선순위를 부여한다.
- 메타데이터 실패와 요소 실패를 분리하고 요소가 있으면 부분 성공으로 응답한다.
- 재시도 큐와 캔버스별 초안을 IndexedDB에 저장한다.
- `ADMIN`만 접근 가능한 `/api/admin/canvas/*` 진단 API와 `/admin/canvas` 화면을 추가한다.
- 진단 이벤트는 payload 없이 30일간 보존한다.

## DB 장애 처리

Spring은 DB 접근 실패를 `DATABASE_UNAVAILABLE`, `retryable=true`, `retryAfterMs=3000`으로 응답한다. 클라이언트는 동일한 `mutationId`와 payload를 IndexedDB에 유지하고 지수 백오프로 한 건씩 재시도한다. 사용자가 재시도를 취소하면 네트워크 요청과 영속 재시도 큐를 함께 제거한다.
