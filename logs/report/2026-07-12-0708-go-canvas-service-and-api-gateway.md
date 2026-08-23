# Go 캔버스 백엔드 신설 + flownote-API 게이트웨이 전환

- 일시: 2026-07-12 07:08 (로컬)
- 브랜치: `feat/go-canvas-gateway` (fix/canvas-load-problem 기반)
- 목표(/goal): flownote-API를 API 라우팅 서버로 전환하고 기존 기능 제거 · Go 기반 flownote-canvas 신설 및 캔버스 백엔드 구성·배포 · flownote-API가 요청별로 백엔드를 결정·배포

## 1. Go 캔버스 백엔드 (`flownote-canvas/`)

flownote-server(Spring)의 `/api/canvas/**` 책임을 Go로 재구현. net/http(Go 1.23 ServeMux) + pgx/v5 + aws-sdk-go-v2.

- 구조: `main.go`, `internal/{config,httpjson,auth,storage,canvas}`.
- 인증: `app_sessions` 공유 조회(Bearer UUID) — flownote-server와 동일.
- 엔드포인트: load/save, metadata, elements(조회/증분저장·mutation 멱등성·advisory lock), viewport, documents CRUD, folders CRUD, assets 업로드/조회.
- **DB 호환 전략**: 요소 payload를 인라인 저장(`object_key=NULL`, `storage_status='READY'`). Spring이 S3로 오프로드한 기존 데이터는 `object_key`로 읽어 read 호환. Redis 캐시·S3 아웃박스 워커는 생략(정확성 무관, 캔버스 쓰기를 Go 한 서비스로만 라우팅하는 전제).
- 검증: docker build ✅ · 로컬 Postgres 계약 스모크(문서/폴더/요소/뷰포트/멱등성 duplicate) ✅ · **Spring↔Go 공유 DB read 호환**(Go가 쓴 `line-1`·revision·문서를 Spring이 동일하게 읽음) ✅

배포: Railway `flownote-canvas` 서비스(id `a2eda8f1-...`)에 Go 이미지 배포(기존 Spring 2호기 대체). 변수는 flownote-main 참조 유지, PORT=8080. deployment SUCCESS, `/` health UP, 프로덕션 DB 연결 확인(가짜 토큰→401).

## 2. flownote-API 게이트웨이 (`flownote-API/app/gateway.py`)

클라이언트 `/api/**`를 받아 경로로 백엔드를 결정하는 리버스 프록시 catch-all 추가.

- `/api/canvas/**` → `CANVAS_API_BASE_URL`(Go)
- 그 외 코어 `/api/**` → `CORE_API_BASE_URL`(Spring)
- FastAPI 자체 백엔드(`/api/aiclient` Gemini, `/api/agent-note` Ollama, `/api/market` 주식, `/api/chat`, `/api/social`)는 각 라우터가 먼저 매칭 → 로컬 처리. 게이트웨이는 마지막 등록이라 나머지만 프록시.
- 기존 직결 경로를 깨지 않는 추가 변경.

배포: flownote-api deployment SUCCESS. 프로덕션 검증:
- `/api/canvas/documents` → **Go 프록시**(Go 401 형식 `"status":401`)
- `/api/notes` → **Spring 프록시**(Spring 401 형식 `code/requestId`)
- `/api/market/search` → **로컬**(422)

## 3. AI/데이터 백엔드 분리 (`flownote-ai/`) — 사용자 결정: "AI 전용 서비스로 분리"

flownote-API의 자체 백엔드 5종을 새 FastAPI 서비스 `flownote-ai`로 이관하고 flownote-API를 순수 게이트웨이로 슬림화.

- 이관: `/api/aiclient`(Gemini), `/api/agent-note`(내부망 Ollama), `/api/market`(주식), `/api/chat`, `/api/social` 라우터 + services + mcpServers + schemas + core_api.
- flownote-API 잔여: `main.py`(게이트웨이+소켓 릴레이), `gateway.py`, `canvas_socket.py`, `core_api.py`. `app/api`·`app/services`·`schemas.py`·`mcpServers` 제거.
- 게이트웨이 라우팅 추가: 위 5개 접두어 → `AI_API_BASE_URL`.
- 주식은 Spring `STOCK_MARKET_DATA_URL`이 게이트웨이 경유(→ flownote-ai)라 무변경.
- 에이전트 노트: Ollama가 내부망 전용이라 클라우드 flownote-ai에서는 미동작(설계상 로컬 전용) — 문서화.

### 배포
- 새 Railway 서비스 `flownote-ai`(id `e7bcf165-...`) 생성. 변수는 `${{flownote-api.KEY}}` 참조(GEMINI_API_KEY/CORE_API_BASE_URL/CORS_ORIGINS), PORT=8000. deployment SUCCESS, health `{"status":"UP","service":"flownote-ai"}`. 사설 `flownote-ai.railway.internal:8000`.
- 게이트웨이 `flownote-api`에 `AI_API_BASE_URL=http://flownote-ai.railway.internal:8000` 설정 후 재배포 SUCCESS.

### 프로덕션 최종 라우팅 검증 (게이트웨이 경유)
- `/api/canvas/documents` → **Go**(401 `"status":401`)
- `/api/market/search` → **flownote-ai**(FastAPI 422 검증 응답)
- `/api/notes` → **Spring**(401; 첫 요청은 flownote-main 콜드스타트로 502 → 웜업 후 정상)

## 4. 로컬 통합 (docker-compose)

- `canvas-server`(Go), `ai-server`(flownote-ai) 추가. `api-server`는 게이트웨이로 조정(`CANVAS_API_BASE_URL`, `AI_API_BASE_URL`).
- `REDIS_HOST_PORT=6380 docker compose up -d --build canvas-server ai-server api-server` → 게이트웨이가 Go/ai-server/Spring으로 정확히 분기 검증.

## 운영 주의

- **콜드스타트 502**: Railway 서비스가 잠들면 게이트웨이의 첫 프록시 요청이 백엔드를 깨우는 동안 502가 날 수 있다(웜업 후 정상). 필요 시 백엔드 min instance 설정 또는 게이트웨이에 재시도 추가.
- **프론트 진입점**: 현재 프론트는 여전히 각 백엔드를 직결(Spring·flownote-ai)하고 canvas만 Go. 게이트웨이를 단일 진입점으로 쓰려면 `VITE_CORE_API_URL`/`VITE_AI_BASE_URL`을 게이트웨이로 모으면 된다(선택).

## 남은 사항 / 후속

- 프론트 진입점 통합: `VITE_CORE_API_URL`을 게이트웨이로 모으면 flownote-API가 단일 진입점이 됨(현재는 프론트가 각 백엔드 직결 + canvas만 Go). 선택 사항.
- Spring 캔버스 코드: 호환/폴백용으로 유지(제거는 Go 안정화 후 별도 단계).
- Go 서비스 미구현 최적화: Redis 요소 캐시, S3 비동기 아웃박스, bbox 공간 인덱스(관리자 진단용). 필요 시 추가.
- 실사용 부하에서 Go 서비스 응답시간·에러율 관찰 권장.
