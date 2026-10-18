# 신뢰성

## 기준 런타임

기준 런타임은 Railway/Vercel의 staging과 production이다. PC 내부망과 Compose는 폐기했다. 웹·모바일은 공개 HTTPS gateway를 사용하고 백엔드·DB·Redis는 Railway private networking을 사용한다.

| 클라우드 서비스 | 포트 | 기대 상태와 책임 |
| --- | --- | --- |
| Postgres | `5432` | 환경별 DB, Flyway 기준 데이터 |
| Redis | `6379` | 환경별 세션·Socket.IO·시장 데이터 캐시 |
| `flownote-main` | `8080` | 인증, 사용자, 모바일 설정, `/actuator/health` |
| `flownote-canvas` | `8080` | 캔버스, 노트, 업로드, `/health` |
| `flownote-sub` (`flownote-serve/`) | `8095` | 일기, 일정, 작업, 주식, 소셜, 채팅, 피드백, `/health` |
| `flownote-ai` | `8000` | 에이전트와 시장 데이터, `/` |
| `flownote-api` | `8080` | 공개 HTTP 게이트웨이와 Socket.IO, `/` |
| Vercel 웹 | HTTPS | SPA 정적 서빙 |
| Railway 모바일 | HTTPS | 정적 웹 및 Expo Go cloud bundle |

## 검증 루프

1. `scripts/verify-services.sh <target>`으로 변경한 서비스의 최소 게이트를 실행한다.
2. API나 DB 계약이 바뀌면 생산자와 웹·모바일 소비자를 함께 검증한다.
3. `node scripts/deploy-cloud.mjs staging <target>`으로 staging 배포와 실제 cloud E2E를 실행한다.
4. 같은 소스의 staging 통과 기록을 확인한다.
5. `node scripts/deploy-cloud.mjs production <target>`으로 production을 배포한다.
6. Railway deployment status와 서비스 healthcheck, Vercel production URL을 확인한다.
7. 배포 결과와 실패 원인은 `logs/report/`에 남긴다.

보고서 전용 작업은 배포를 생략한다. 코드·설정 변경은 staging 검증을 건너뛰지 않는다. 로컬 Compose 실행은 더 이상 검증 조건이 아니다.

## Cloud 가용성

- Vercel production은 `https://flownote-react.vercel.app`을 기준 URL로 사용한다.
- Railway 공개 게이트웨이는 `https://flownote-api-production.up.railway.app`이다.
- Railway 서비스의 `railway.json` healthcheck가 성공해야 배포 성공으로 판단한다.
- sleep이 켜진 서비스는 첫 연결에 콜드 스타트가 발생할 수 있다. 게이트웨이는 연결 수립 실패를 재시도하지만 Spring 초기화가 재시도 시간보다 길면 첫 요청이 502가 될 수 있다.
- `scripts/cloud-resource-policy.mjs`가 환경별 sleep 계약을 소유한다. staging의 모든 앱 서비스는 Serverless를 기본 사용하고 PostgreSQL·Redis만 계속 가동한다. production에서 중지된 AI·모바일 정적 웹·Expo Go는 staging에서도 중지하며 `all` 배포 대상에서 제외한다. production에서 가동 중인 앱 서비스는 always-on으로 운영한다.
- Spring은 256MiB 최대 힙과 작은 Hikari 풀을 사용한다. staging 풀은 idle connection을 0까지 회수해 sleep을 방해하지 않아야 하며, production은 최소 연결 1개를 유지한다.

## 관측과 복구

- 캔버스 저장 메시지가 900,000 UTF-8 bytes를 넘으면 게이트웨이 `POST /api/canvas/save`로 전송한다. 전체 HTTP 요청 상한은 32MiB이며 소켓 수신 상한은 1,000,000이다. HTTP/소켓은 같은 mutationId, 저장 응답 및 room 변경 알림을 사용한다.
- 크기 초과 또는 `retryable:false` 등 영구 실패는 IndexedDB 큐의 `blocked` 상태로 보존한다. 자동 재시도·재접속·새로고침은 이를 해제하지 않는다. 내용 변경이나 명시적 수동 저장으로 다시 시도할 수 있다.
- 소켓 재연결은 재시도 backoff를 초기화하지 않는다. 큰 라인 미리보기와 오프라인 미리보기는 버퍼에 쌓지 않고, 영속 저장과 원격 변경 알림으로 복구한다.
- 일반 문서 동기화는 인증된 `/sync` namespace를 사용하며 사용자별로 격리한다. 인증 토큰은 URL 대신 Socket.IO auth에 보내며 연결 중에는 60초 간격으로 재검증한다. 재접속 후 `all/reconnected` 알림으로 놓친 변경을 다시 조회한다.

- 모든 게이트웨이 요청은 `X-Request-ID`를 생성하거나 전파한다. 장애 조사 시 클라이언트 응답의 request id와 Railway 로그를 연결한다.
- Railway에서는 서비스별 deployment/build/http 로그와 CPU·메모리·HTTP 지표를 확인한다.
- 배포 실패 시 새 코드를 반복 배포하기 전에 build 실패, runtime crash, 환경 변수, upstream 연결 문제로 분류한다.
- 롤백은 Vercel 이전 deployment promote 또는 Railway의 이전 성공 deployment redeploy를 사용한다. DB 마이그레이션은 별도 역마이그레이션 없이 임의 롤백하지 않는다.

## 알려진 위험

- 웹 CI는 lint, 전체 TypeScript build, Playwright 캔버스 저장 스모크를 실행한다. 로컬에 Chromium 시스템 라이브러리가 없으면 공식 Playwright 컨테이너로 `yarn e2e`를 실행한다.
- Spring과 Go 테스트는 인증·오류 응답 계약을 우선 커버하지만 각 CRUD 도메인의 DB 통합 테스트는 여전히 제한적이다.
- Railway PostgreSQL 버전이 현재 Flyway 라이브러리의 공식 검증 범위보다 앞서 있어 업그레이드 전 호환성 확인이 필요하다.
- 로컬 Ollama 통신 구현은 제거됐다. 기존 agent-note 기능 경로는 410을 반환한다.

세부 배포 명령, 환경 변수와 롤백 절차는 `docs/DEPLOYMENT.md`를 따른다.
