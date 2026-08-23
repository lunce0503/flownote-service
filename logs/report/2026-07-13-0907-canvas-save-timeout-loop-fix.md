# 캔버스 저장 35초 타임아웃 루프 해소 (게이트웨이+Go 백엔드)

- 일시: 2026-07-13 09:07 (로컬)
- 브랜치: `backend/canvas-save-timeout`(d278084) → `release/prod`·`main` 머지(e1e33c8), 전부 푸시
- 선행 보고: `2026-07-13-0837-canvas-save-load-stability.md`(프론트 큐 수정), 본 건은 같은 증상의 백엔드 측 원인

## 증상과 원인

캔버스 `dc470a5b…`의 `elements/save`가 08:15부터 17회 연속, 매번 ~35초 `TimeoutError`로 실패(게이트웨이 로그). 원인 체인:

1. **Go `upsertElements`가 요소당 1왕복 `tx.Exec`** — 아이패드에 쌓인 수천 요소 백로그가 한 mutation으로 오면 왕복 누적으로 35초 초과
2. 게이트웨이 `urlopen(timeout=35)` 하드코딩 → 타임아웃과 함께 연결이 끊기면 Go의 요청 컨텍스트 취소 → **트랜잭션 전체 롤백** → 진전 없이 동일 실패 반복
3. Go에 요청 로그가 전무해 백엔드 처리 시간을 관찰할 수 없었음

배제한 가설: DB 잠금(pg_stat_activity 0행), 서비스 다운(health 200·인증 DB 경로 0.9s).

## 수정

- `flownote-canvas/internal/canvas/repo.go`: upsert를 `pgx.Batch` 청크(500)로 배치화 — 동일 SQL·동일 멱등성, 왕복만 축소
- `flownote-canvas/main.go`: 헬스체크 제외 전 요청 로깅(상태·ms, 2s 초과 `SLOW` 표시)
- `flownote-API/app/core_api.py`·`canvas_socket.py`: `forward_request` 타임아웃 파라미터화, 캔버스 저장만 `CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS`(기본 90s). 저장이 원장에 기록되면 프론트 재시도가 duplicate로 즉시 성공하는 안전망

## 검증

- pytest 12 passed(게이트웨이) · Go docker 빌드 성공 · compose 10개 서비스 기동
- Railway `flownote-api`·`flownote-canvas` 배포 SUCCESS, health ok
- **프로덕션 해소 증거**: 게이트웨이 저장 실패가 09:00:02(구 인스턴스, 35s) 이후 **0건**. Go 신규 요청 로그에서 무거운 저장이 `POST /api/canvas/elements/save -> 200 4398ms` — 이전엔 35초로도 못 끝내던 작업이 4.4초에 완료, 직후 클라이언트가 메타데이터·요소 재로드(정상 저장 후 흐름)

## 후속 관찰 항목

- Go 요청 로그에 쿼리스트링(canvasId) 미출력 — 로그 포맷에 추가하면 캔버스별 추적 용이(1줄, 다음 배포에 포함 권장)
- 다음 소켓 저장부터 게이트웨이 `canvas_save_completed`와 Go `SLOW` 로그를 함께 보면 구간별(게이트웨이↔Go↔DB) 지연 분해 가능
- 대형 payload 프론트 청크 분할은 배치화로 실측 4.4초까지 내려와 당장 불필요 — 재발 시 검토
