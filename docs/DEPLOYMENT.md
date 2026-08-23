# 배포 운영 기준

## 목적

이 문서는 Flownote의 검증, production 배포, 헬스체크와 롤백 절차의 기준이다. 동적으로 바뀌는 deployment id와 장애 조사 결과는 `logs/report/`에 남기고, 이 문서에는 반복 가능한 절차만 유지한다.

## 배포 대상

| target | 소스 | cloud 대상 | 사전 검증 | healthcheck |
| --- | --- | --- | --- | --- |
| `web` | `flownote/` | Vercel `flownote-react` | `yarn verify`, `yarn e2e` | `/` |
| `api` | `flownote-API/` | Railway `flownote-api` | `uv run pytest -q` | `/` |
| `main` | `flownote-server/` | Railway `flownote-main` | `./gradlew test` | `/actuator/health` |
| `canvas` | `flownote-canvas/` | Railway `flownote-canvas` | `go test ./...` | `/` |
| `serve` | `flownote-serve/` | Railway `flownote-serve` | `go test ./...` | `/` |
| `ai` | `flownote-ai/` | Railway `flownote-ai` | `uv run pytest -q` | `/`, `/api/capabilities` |
| `mobile` | `flownote-mobile/` | Railway `flownote-mobile-production` 웹 테스트 | `yarn verify` | `/health` |

웹과 모바일의 공개 API 기준 URL은 `https://flownote-api-production.up.railway.app`이다. Railway의 Spring·Go·AI 서비스 URL은 클라이언트에 노출하지 않는다.

## 로컬 검증

의존성을 설치한 뒤 대상별 표준 스크립트를 실행한다.

```bash
./scripts/verify-services.sh web
./scripts/verify-services.sh api
./scripts/verify-services.sh all
```

`all`은 웹, gateway, Spring, 두 Go 서비스, AI, 모바일을 검증하고 마지막에 Compose 구문을 확인한다. 전체 작업 종료 전 통합 런타임은 별도로 실행한다.

```bash
docker compose up -d --build
docker compose ps
```

## 수동 production 배포

Railway와 Vercel CLI 로그인을 확인한 뒤 영향받는 target만 배포한다.

```bash
railway whoami --json
vercel whoami

./scripts/deploy-production.sh web
./scripts/deploy-production.sh serve
./scripts/deploy-production.sh all
```

스크립트는 검증을 먼저 실행하고, Railway의 새 deployment가 `SUCCESS` 또는 `SLEEPING`이 될 때까지 기다린다. 이미 같은 검증을 완료한 CI에서만 `SKIP_VERIFY=true`를 사용할 수 있다.

```bash
SKIP_VERIFY=true RELEASE_MESSAGE="Deploy planner fixes" \
  ./scripts/deploy-production.sh api
```

`all`의 순서는 `main -> canvas -> serve -> ai -> api -> mobile -> web`이다. 스키마·내부 서비스를 먼저 준비하고 공개 gateway와 클라이언트를 나중에 교체한다.

## GitHub Actions

- `.github/workflows/mobile-was.yml`: 모든 하위 프로젝트의 lint, typecheck, build, test gate를 병렬 실행한다. web job은 Chromium Playwright 스모크까지 실행한다.
- `.github/workflows/deploy-production.yml`: `workflow_dispatch`로 target을 선택하는 production 배포다. GitHub `production` environment에 승인 규칙을 걸 수 있다.

Repository secrets:

- `RAILWAY_TOKEN`
- `VERCEL_TOKEN`

Repository variables:

- `RAILWAY_PROJECT_ID`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

토큰과 실제 환경 변수 값은 문서나 workflow 파일에 직접 기록하지 않는다.

## 환경 변수 기준

- Vite의 `VITE_*`와 Expo의 `EXPO_PUBLIC_*`은 번들에 노출되므로 비밀값을 넣지 않는다.
- 외부 클라이언트용 API URL은 gateway를 가리킨다.
- Railway 서비스 간 호출은 private networking URL을 사용한다.
- 세션·DB·Redis·S3·Gemini 비밀값은 Railway service variables 또는 Vercel environment variables에서 관리한다.
- 로컬 기본값과 변수 이름은 `.env.example`, 서비스 연결은 `docker-compose.yml`을 기준으로 한다.
- `AGENT_NOTE_ENABLED=true`는 Ollama가 있는 Compose/내부망에서만 설정한다. Railway AI에서는 설정하지 않아 capability를 비활성으로 유지한다.

## 가용성과 sleep 정책

Railway sleep은 비용을 줄이지만 upstream 초기화 중 첫 gateway 요청이 502가 될 수 있다. Flownote production의 5개 백엔드는 `railway.json`의 `sleepApplication: false`를 사용해 always-on으로 운영한다. 모바일 정적 웹 테스트 서비스만 sleep을 허용한다. 비용 절감을 위해 백엔드 sleep을 다시 켤 경우 다음 조건을 함께 충족해야 한다.

- gateway가 연결 수립 실패를 재시도한다.
- 클라이언트는 GET의 502·503·504와 네트워크 실패만 제한적으로 재시도한다.
- POST·PATCH 등 변경 요청은 중복 처리 위험 때문에 자동 재시도하지 않는다.
- 배포 직후 공개 API를 호출해 upstream 준비 상태까지 확인한다.

## 배포 후 확인

```bash
curl -fsS https://flownote-react.vercel.app/ >/dev/null
curl -fsS https://flownote-api-production.up.railway.app/
curl -fsS https://flownote-api-production.up.railway.app/api/mobile/config
curl -fsS https://flownote-mobile-production-production.up.railway.app/health
```

인증 API는 401 자체가 정상일 수 있으므로 공개 health와 보호 경로의 기대 status를 구분한다. 502가 발생하면 응답의 `X-Request-ID`와 Railway gateway/upstream 로그를 함께 조회한다.

## 롤백

- Vercel: 이전 Ready deployment를 production alias로 promote한다.
- Railway: 실패 서비스의 이전 성공 deployment를 redeploy한다.
- DB: 이미 적용된 Flyway migration은 임의 삭제하거나 버전을 되돌리지 않는다. 호환 가능한 새 migration으로 수정한다.
- 롤백 후에도 공개 URL, `/api/mobile/config`, 변경된 주요 사용자 흐름을 다시 확인한다.

배포 실패 보고에는 target, commit SHA, deployment id, 실패 단계, 핵심 로그, 롤백 여부와 남은 위험을 포함한다.
