# 캔버스 저장/재시도·드로잉·스테이징 로그인 버그 수정

작성 2026-07-20 14:10 UTC. 사용자가 신고한 4개 증상을 진단·수정·배포했다.

## 신고 증상 → 진단 → 수정

### 1) 캔버스 저장/불러오기 안 되고 "재시도"만 반복 (프로덕션)
- **근본 원인**: 클라이언트 저장 타임아웃 `CANVAS_SAVE_REQUEST_TIMEOUT_MS = 30초`가 게이트웨이 저장 포워딩 타임아웃 `CANVAS_SAVE_FORWARD_TIMEOUT_SECONDS = 90초`보다 **짧다**. 백엔드 저장이 느려 30~90초 걸리면(관측: 프로덕션 `GET /api/notes`가 21초·10초 SLOW — 백엔드가 실제로 이 구간에서 느림) 클라이언트가 30초에 먼저 포기 → 재시도 큐 적재 → 재시도해도 또 30초 초과. 백엔드가 결국 커밋해도 클라이언트는 성공 ack를 못 받아 **"재시도" 무한 루프**. 로드도 이 루프에 물려 `hasPendingLocalChanges()`가 참인 동안 원격 반영이 막힌다.
- **참고 증상**: 게이트웨이 소켓은 안정적이었고(16초 실측 connect 1·disconnect 0·websocket), 프로덕션 로그의 `GET /api/canvas/metadata` 2초 폴링은 소켓 재연결이 아니라 `canvas:join` 반복 emit 때문(약 1분 일시 버스트, 현재는 없음). 핵심 유발원은 저장 타임아웃 불일치다.
- **수정**: `flownote/src/features/canvas/model/canvasSocketClient.ts` — `CANVAS_SAVE_REQUEST_TIMEOUT_MS` 30_000 → **95_000**(게이트웨이 90초보다 크게). 이제 느린 저장도 게이트웨이 응답(성공/실패)을 기다려 조기 타임아웃 루프가 사라진다.

### 2) 선을 그린 뒤 렌더링에서 "조금 더" 그려짐
### 3) 빠르게 그릴 때 선의 양끝 점이 연결됨
- **근본 원인(2·3 공통)**: Konva `Line`의 `LINE_TENSION = 0.12` 스플라인(Catmull-Rom). 끝점에서 오버슈트해 획이 실제보다 조금 더 뻗고(2), 빠른 획처럼 점이 적을 땐 곡선이 되말려 양끝이 이어져 보인다(3). 손그림 점은 이미 `appendPoint`로 촘촘히 보간(≤8px)되고 `smoothLinePoints`로 평활화되므로 tension은 불필요·유해.
- **수정**: `flownote/src/features/canvas/model/useCanvasRendering.tsx` — `LINE_TENSION` 0.12 → **0**(폴리라인 렌더). 커밋된 선과 그리는 중 활성 선 모두 동일 상수를 쓰므로 두 렌더 경로에 함께 적용됨.

### 4) 스테이징에서 로그인/가입 계정으로 로그인 안 됨
- **근본 원인**: 스테이징 `flownote-main`(Spring)이 `redis.railway.internal:6379`에 연결 실패(`RedisCommandTimeoutException: ...500ms`). fork된 스테이징은 앱 서비스와 Redis의 리전이 달라 교차 리전 지연이 Spring의 `spring.data.redis.timeout: 500ms`를 넘긴다. 그 결과 `RedisReactiveHealthIndicator`가 실패 → `/actuator/health` **DOWN(503)** → Railway 헬스체크 실패 → 게이트웨이 상류 연결 실패(**502 ConnectError**) → 로그인 불가.
- **설계 정합성**: Redis는 세션 캐시(무음 폴백)라 필수 의존성이 아니다. 캐시 장애가 인증 서비스를 통째로 죽이는 건 설계 위반.
- **수정**:
  - `flownote-server/src/main/resources/application.yml` — `management.health.redis.enabled: false` 추가. Redis 장애/지연이 전체 health를 DOWN시키지 않게 게이팅 제외(프로덕션 회복력도 향상).
  - 스테이징 `flownote-main` 환경변수 `SPRING_DATA_REDIS_TIMEOUT=2000ms`(교차 리전 대비, 프로덕션 기본 500ms는 그대로 — 프로덕션 Redis는 동일 리전).
- **실증(스테이징)**: health `{"status":"UP"}`; `POST /api/users`(가입) 200 → `POST /api/users/login`(email+password) 200(토큰 발급). 가입한 계정으로 로그인 정상.
- **UX 유의**: 로그인은 `username`이 아니라 **email**을 받는다(`LoginRequest{email,password}`). username으로 시도하면 400. 사용자가 아이디로 로그인하려 했다면 이 점도 원인일 수 있다.

## 검증

- 프론트 `yarn build` ✓ (11.96s)
- Spring `./gradlew test` ✓ BUILD SUCCESSFUL
- 프로덕션 배포 후: main health UP, 게이트웨이 UP, 로그인 401(정상 거부, 502 아님)
- 스테이징 배포 후: main health UP, 가입→로그인 200 실증

## 배포

| 대상 | 변경 | 배포 |
| --- | --- | --- |
| flownote-react (Vercel prod) | tension·저장 타임아웃 | `vercel --prod` |
| flownote-react-staging (Vercel) | 동일 | `vercel --prod`(재링크 후 원복) |
| flownote-main prod (Railway) | Redis health 게이팅 해제 | `railway up ./flownote-server -e production` |
| flownote-main staging (Railway) | 동일 + Redis timeout 2s | `railway up ./flownote-server -e staging` |

- Docker 통합 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` — **성공(exit 0)**, 전 서비스 재빌드·기동. 단 `ai-server`는 `sh: uvicorn: not found`로 Restarting — **이번 변경과 무관한 flownote-ai 컨테이너의 사전 존재 로컬 이슈**(변경 파일은 Spring `application.yml`·프론트 2개뿐, flownote-ai 미변경, 프로덕션 flownote-ai는 정상). 후속으로 ai 이미지 start 커맨드(`uvicorn` PATH/`uv run`) 점검 필요.

## 후속(별도)

- **백엔드 저장/조회 지연**(`/api/notes` 21초 등)이 저장 타임아웃 루프의 근원이다. 타임아웃 상향은 조기 실패 루프를 없애지만 느림 자체는 남는다. 캔버스/노트 쿼리·인덱스·배치 업서트 성능을 별도로 점검할 것.
