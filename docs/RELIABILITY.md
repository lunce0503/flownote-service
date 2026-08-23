# 신뢰성

## 기준 런타임

로컬과 내부망의 기준 실행 방식은 저장소 루트의 Docker Compose다. 웹과 모바일은 `flownote-API` 게이트웨이만 공개 API로 사용하고, Spring·Go·AI 서비스는 게이트웨이 뒤의 내부 서비스로 취급한다.

| Compose 서비스 | 포트 | 기대 상태와 책임 |
| --- | --- | --- |
| `db` | `5432` | PostgreSQL healthy, Flyway가 관리하는 기준 데이터 |
| `redis` | `6379` | 세션·Socket.IO·시장 데이터 캐시, healthy |
| `spring-server` | `8080` | 인증, 사용자, 모바일 설정, `/actuator/health` |
| `canvas-server` | `8090` | 캔버스, 노트, 업로드, `/health` |
| `serve-server` | `8095` | 일기, 일정, 작업, 주식, 소셜, 채팅, 피드백, `/health` |
| `ai-server` | host `8010` | 에이전트와 시장 데이터, `/` |
| `api-server` | `8000` | 공개 HTTP 게이트웨이와 Socket.IO, `/` |
| `react-app` | `5173` | Vite SPA 정적 서빙 |
| `mobile-app` | `8081` | Expo/Metro 개발 서버 |
| `ollama` | 내부 `11434` | 로컬 agent-note 모델, 외부 비공개 |

## 검증 루프

1. `scripts/verify-services.sh <target>`으로 변경한 서비스의 최소 게이트를 실행한다.
2. API나 DB 계약이 바뀌면 생산자와 웹·모바일 소비자를 함께 검증한다.
3. 루트에서 `docker compose up -d --build`를 실행하고 `docker compose ps`를 확인한다.
4. 변경한 경로를 로컬 `curl` 또는 브라우저로 확인한다.
5. `scripts/deploy-production.sh <target>`으로 영향받는 production만 배포한다.
6. Railway deployment status와 서비스 healthcheck, Vercel production URL을 확인한다.
7. 배포 결과와 실패 원인은 `logs/report/`에 남긴다.

`logs/report/` 전용 문서 작업은 실행 산출물이 없으므로 Docker와 cloud 배포를 생략한다. 그 외 문서만 바뀐 경우 저장소 규칙에 따라 Vercel production을 재배포하고, 백엔드 산출물이 바뀌지 않았으면 Railway는 생략 사유를 기록한다.

## Cloud 가용성

- Vercel production은 `https://flownote-react.vercel.app`을 기준 URL로 사용한다.
- Railway 공개 게이트웨이는 `https://flownote-api-production.up.railway.app`이다.
- Railway 서비스의 `railway.json` healthcheck가 성공해야 배포 성공으로 판단한다.
- sleep이 켜진 서비스는 첫 연결에 콜드 스타트가 발생할 수 있다. 게이트웨이는 연결 수립 실패를 재시도하지만 Spring 초기화가 재시도 시간보다 길면 첫 요청이 502가 될 수 있다.
- production의 5개 백엔드는 `railway.json`에서 sleep을 끄고 always-on으로 운영한다. 모바일 정적 웹 테스트 서비스만 sleep을 허용한다.

## 관측과 복구

- 모든 게이트웨이 요청은 `X-Request-ID`를 생성하거나 전파한다. 장애 조사 시 클라이언트 응답의 request id와 Railway 로그를 연결한다.
- Railway에서는 서비스별 deployment/build/http 로그와 CPU·메모리·HTTP 지표를 확인한다.
- 배포 실패 시 새 코드를 반복 배포하기 전에 build 실패, runtime crash, 환경 변수, upstream 연결 문제로 분류한다.
- 롤백은 Vercel 이전 deployment promote 또는 Railway의 이전 성공 deployment redeploy를 사용한다. DB 마이그레이션은 별도 역마이그레이션 없이 임의 롤백하지 않는다.

## 알려진 위험

- 웹 CI는 lint, 전체 TypeScript build, Playwright 캔버스 저장 스모크를 실행한다. 로컬에 Chromium 시스템 라이브러리가 없으면 공식 Playwright 컨테이너로 `yarn e2e`를 실행한다.
- Spring과 Go 테스트는 인증·오류 응답 계약을 우선 커버하지만 각 CRUD 도메인의 DB 통합 테스트는 여전히 제한적이다.
- Railway PostgreSQL 버전이 현재 Flyway 라이브러리의 공식 검증 범위보다 앞서 있어 업그레이드 전 호환성 확인이 필요하다.
- agent-note의 Ollama는 의도적으로 로컬/내부망 전용이다. cloud AI는 `/api/capabilities`와 `/api/agent-note/health`에서 비활성 상태를 명시하며 요청 시 503을 반환한다.

세부 배포 명령, 환경 변수와 롤백 절차는 `docs/DEPLOYMENT.md`를 따른다.
