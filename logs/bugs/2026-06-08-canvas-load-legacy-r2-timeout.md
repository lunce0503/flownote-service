# 2026-06-08 그림판 불러오기 큐 timeout

## 증상

- Vercel 프론트에서 그림판 불러오기 중 `canvas:load socket request failed`가 발생했다.
- Railway `flownote-api` 로그에서 `canvas_core_request_failed label=canvas_elements`와 `httpx.ReadTimeout`이 확인됐다.
- 실패 시점의 FastAPI 요청은 Spring `GET /api/canvas/elements` 응답을 기다리다 35초 제한을 넘겼다.

## 확인한 로그

- `canvasId=a80f2f9e-0963-4370-a86a-c5a53f2f3bfe`
  - FastAPI: `/api/canvas/elements?...` 요청이 약 35초 뒤 timeout.
  - Spring: 같은 canvas의 요소 로드가 `rows=1477`, `elapsedMs=128354`로 128초 이상 소요.
- `canvasId=2a12eb48-7f61-4ef2-b66b-bde241e44f88`
  - Spring: `rows=4085`, `lines=4069`, `images=16`, `bytes=1403662`, `elapsedMs=180958`.

## 원인

1. Spring `CanvasService.buildElementArrays()`가 `stream().map(supplyAsync).map(join)` 형태라 각 row를 제출한 직후 join했다.
2. 결과적으로 R2 legacy payload 읽기가 실질적으로 순차 처리되어 큰 그림판에서 100초 이상 걸렸다.
3. legacy payload는 DB payload에 `{id, objectKey, url}` 메타데이터만 남아 있어 매번 R2에서 다시 읽었다.
4. FastAPI의 Spring read timeout은 35초였고, React 소켓 로드 timeout은 90초였으므로 큰 그림판을 정상 대기하지 못했다.

## 수정

- Spring `CanvasService`에서 모든 `CompletableFuture`를 먼저 생성한 뒤 join하도록 변경해 R2 legacy payload 읽기를 실제 병렬 처리한다.
- R2에서 legacy payload를 성공적으로 읽은 경우, 전체 payload를 `canvas_elements.payload`에 backfill해 다음 로드부터 DB에서 바로 읽게 했다.
- 개별 row 로드 실패는 `PARTIAL` 상태로 기록할 수 있도록 실패 row 수를 집계한다.
- FastAPI `canvas_socket.py`의 Spring read timeout을 180초로 늘렸다.
- React `usePersistence.tsx`의 `CANVAS_SOCKET_LOAD_TIMEOUT_MS`를 180초로 늘렸다.

## 검증

- `flownote-server`: `./gradlew test --tests 'com.flownote.canvas.*'` 성공.
- `flownote-API`: `uv run python -m unittest discover -s tests -v` 성공.
- `flownote`: `yarn build` 성공.
- 저장소 루트: `docker compose up -d --build` 성공.
- 운영 헬스체크:
  - Spring `https://flownote-production.up.railway.app/actuator/health` -> `{"status":"UP"}`
  - FastAPI `https://flownote-api-production.up.railway.app/docs` -> `200`
  - Vercel `https://flownote-react.vercel.app` -> `200`

## 배포

- Railway `flownote-api`: deployment `2344fbe2-4afa-4c77-8439-fb151dd2a643`, `SUCCESS`.
- Railway `flownote-main`: deployment `5135ace0-aec8-4043-aa8e-33975e2915a2`, `SUCCESS`.
- Vercel production: deployment `dpl_42BMffk7Ls2Je9dVgwrPzy5Ymu9P`, alias `https://flownote-react.vercel.app`.
