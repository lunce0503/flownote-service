# Railway production 교차 리전 지연

## 증상

- 캔버스 진입 시 문서·폴더 목록과 사용자 확인이 오래 걸렸다.
- 2026-08-30 production HTTP 로그에서 `/api/canvas/documents`와 `/api/canvas/folders`가 각각 약 2.7초, 웜 요청도 약 530ms였다.
- `/api/users/me`도 약 599~1,123ms가 관찰됐다.

## 원인

- `flownote-api`, `flownote-main`, `flownote-canvas`는 Railway `us-west2`에 있었다.
- PostgreSQL과 Redis는 `asia-southeast1-eqsg3a`에 있어 인증과 목록 조회마다 교차 리전 왕복이 발생했다.
- 같은 시간대 CPU와 메모리는 각각 한도 대비 매우 낮았고 4xx/5xx 오류율도 0%여서 자원 포화나 애플리케이션 예외는 원인이 아니었다.
- 장시간으로 표시된 `/socket.io/` HTTP 항목은 지연 요청이 아니라 정상 WebSocket 연결 유지 시간이다.

## 수정

- production의 `flownote-api`, `flownote-main`, `flownote-canvas`를 `asia-southeast1-eqsg3a` 단일 리전으로 이동했다.
- 세 서비스의 `railway.json`에도 같은 단일 리전을 명시해 이후 배포에서 설정이 유지되도록 했다.

## 검증

- 세 서비스의 새 deployment가 `SUCCESS`이고 PostgreSQL·Redis와 같은 Singapore 리전임을 확인했다.
- Railway 내부 처리 시간은 캔버스 인증 DB 조회가 3~19ms, 사용자 API 웜 요청이 31~38ms로 감소했다.
- 공개 health는 API, Canvas, Spring 모두 HTTP 200이었다.
