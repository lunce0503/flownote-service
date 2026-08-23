# 캔버스 불러오기 큐 수정 배포

## 원인

FastAPI의 부분 불러오기 조합 함수가 `Exception`만 예외로 분류했다. `asyncio.CancelledError`는 `BaseException` 계열이라 메타데이터나 요소 요청 취소가 정상 데이터처럼 처리될 수 있었다.

## 수정

- 요소 요청 결과가 `BaseException`이면 원래 예외를 그대로 발생시킨다.
- 메타데이터 요청 결과가 `BaseException`이면 요소 데이터는 유지하고 부분 실패 경고로 처리한다.
- 취소 예외 회귀 테스트 2건을 추가했다.

## 검증

- `flownote-API`: `uv run python -m unittest discover -s tests -v` 9건 성공
- `docker compose up -d --build` 성공
- `docker compose ps` 기준 모든 컨테이너 실행

## 배포

- Railway `flownote-api`: `649ad7f7-2893-46f7-9a7e-1cd5621e2a43`
- 상태: `SUCCESS`
- 운영 health: https://flownote-api-production.up.railway.app/ HTTP `200`

## 배포 제외

- `flownote/`와 `flownote-server/` 실행 코드는 변경하지 않았으므로 Vercel과 Railway `flownote-main`은 재배포하지 않았다.
