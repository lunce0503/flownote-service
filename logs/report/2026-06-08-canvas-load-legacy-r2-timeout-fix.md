# 그림판 불러오기 큐 오류 분석 및 배포 보고서

작성일: 2026-06-08

## 결론

그림판 불러오기 큐의 한 데이터 로드 실패는 소켓 자체 오류가 아니라 FastAPI가 Spring `/api/canvas/elements` 응답을 기다리다 timeout 된 문제였다. Spring에서는 큰 캔버스의 legacy R2 요소 payload를 사실상 순차로 읽고 있었고, legacy row는 읽은 뒤 DB에 backfill되지 않아 같은 지연이 반복됐다.

## 로그 근거

- FastAPI `flownote-api`
  - `canvas_core_request_failed label=canvas_elements method=GET path=/api/canvas/elements?... elapsed_ms=35020`
  - `httpx.ReadTimeout`
  - `canvas_load_failed ... elapsed_ms=35142`
- Spring `flownote-main`
  - `canvasId=a80f2f9e-0963-4370-a86a-c5a53f2f3bfe`: `rows=1477`, `elapsedMs=128354`
  - `canvasId=2a12eb48-7f61-4ef2-b66b-bde241e44f88`: `rows=4085`, `lines=4069`, `images=16`, `elapsedMs=180958`

## 변경 사항

- [flownote-server/src/main/java/com/flownote/canvas/CanvasService.java](/home/kwon/Flownote/service/flownote-server/src/main/java/com/flownote/canvas/CanvasService.java)
  - 캔버스 요소 row 조회 시 `id`, `canvas_id`, `user_id`, `storage_status`를 함께 읽도록 변경.
  - `CompletableFuture`를 모두 생성한 뒤 join해 요소 payload 로드를 병렬화.
  - legacy metadata-only payload를 R2에서 읽은 뒤 `canvas_elements.payload`에 backfill.
  - 개별 요소 실패를 전체 실패로만 처리하지 않도록 실패 row 수와 `PARTIAL` 응답 상태를 집계.
- [flownote-API/app/canvas_socket.py](/home/kwon/Flownote/service/flownote-API/app/canvas_socket.py)
  - Spring read timeout을 35초에서 180초로 조정.
- [flownote/src/features/canvas/model/usePersistence.tsx](/home/kwon/Flownote/service/flownote/src/features/canvas/model/usePersistence.tsx)
  - `CANVAS_SOCKET_LOAD_TIMEOUT_MS`를 90초에서 180초로 조정.

## 검증 결과

- `flownote-server`: `./gradlew test --tests 'com.flownote.canvas.*'` 성공.
- `flownote-API`: `uv run python -m unittest discover -s tests -v` 성공.
- `flownote`: `yarn build` 성공. Vite chunk size 경고만 남음.
- `docker compose up -d --build` 성공.
- `docker compose ps`에서 `flownote-api`, `flownote-spring`, `flownote-react`, `flownote-next`, `flownote-db`, `flownote-redis` 실행 확인.

## 운영 배포

- Vercel production
  - deployment: `dpl_42BMffk7Ls2Je9dVgwrPzy5Ymu9P`
  - URL: `https://flownote-react-f25u8lbnv-flownote-service.vercel.app`
  - alias: `https://flownote-react.vercel.app`
  - 헬스 확인: `200`
- Railway `flownote-api`
  - deployment: `2344fbe2-4afa-4c77-8439-fb151dd2a643`
  - status: `SUCCESS`
  - 헬스 확인: `https://flownote-api-production.up.railway.app/docs` -> `200`
- Railway `flownote-main`
  - deployment: `5135ace0-aec8-4043-aa8e-33975e2915a2`
  - status: `SUCCESS`
  - 헬스 확인: `https://flownote-production.up.railway.app/actuator/health` -> `{"status":"UP"}`

## 남은 확인 사항

- 첫 로드에서 legacy R2 row가 많은 캔버스는 아직 R2를 병렬로 읽으며 backfill하므로 한 번은 상대적으로 느릴 수 있다.
- 같은 캔버스의 다음 로드부터는 DB payload를 읽어야 하므로 Spring 로그에서 `canvas_elements_load_completed`의 `elapsedMs`가 줄어드는지 확인한다.
- 운영에서 동일 canvas에 대해 `canvas_element_payload_read_failed` 또는 `canvas_elements_partial_load`가 반복되면 해당 R2 object key 누락 여부를 별도 점검한다.
