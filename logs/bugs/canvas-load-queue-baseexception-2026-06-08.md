# 캔버스 불러오기 큐 예외 분류 오류

## 증상

캔버스 불러오기 큐에서 메타데이터 또는 요소 요청 중 하나가 취소될 때 원래 취소 예외가 아닌 다른 처리 오류로 바뀔 수 있었다.

## 원인

FastAPI 게이트웨이의 `_combine_canvas_load_results`가 `asyncio.gather(..., return_exceptions=True)` 결과를 `Exception` 기준으로만 판별했다. `asyncio.CancelledError`는 `BaseException` 계열이라 예외로 분류되지 않고 정상 결과처럼 처리될 수 있었다.

## 수정

- 요소 결과가 `BaseException`이면 원래 예외를 그대로 발생시킨다.
- 메타데이터 결과가 `BaseException`이면 선·이미지·텍스트 요소는 계속 반환하고 메타데이터 부분 실패 경고로 처리한다.
- `asyncio.CancelledError`에 대한 회귀 테스트를 추가했다.

## 검증

- `flownote-API`: `uv run python -m unittest discover -s tests -v` 9건 성공
