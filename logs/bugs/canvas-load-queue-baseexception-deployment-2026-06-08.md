# 캔버스 불러오기 큐 수정 배포 결과

## 변경

- `asyncio.gather(..., return_exceptions=True)` 결과에서 `asyncio.CancelledError` 같은 `BaseException` 계열을 올바르게 분류하도록 수정했다.
- 메타데이터 요청 취소는 부분 실패로 처리하고, 요소 요청 취소는 불러오기 취소/실패로 유지한다.

## 검증

- `flownote-API`: `uv run python -m unittest discover -s tests -v` 9건 성공
- `docker compose up -d --build` 성공
- `docker compose ps` 기준 모든 컨테이너 실행

## 배포

- Railway `flownote-api`: `649ad7f7-2893-46f7-9a7e-1cd5621e2a43`
- 상태: `SUCCESS`
- 운영 URL: https://flownote-api-production.up.railway.app/
- 헬스 응답: HTTP `200`

## 메모

- Uvicorn startup 로그가 Railway에서 `level=error`로 표시되지만, 내용은 startup complete와 WebSocket accept이며 장애 로그가 아니다.
