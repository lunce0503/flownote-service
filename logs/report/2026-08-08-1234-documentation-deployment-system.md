# 문서 및 배포 체계 업데이트

## 범위

- 현재 FastAPI gateway, Spring auth/schema, Go canvas/serve, Python AI 경계에 맞게 System of Record 문서와 서비스 README를 정정했다.
- 제거된 `flownote-next`, 모바일 WebView, localhost:3000 가정을 로컬 환경 변수와 Compose 기본값에서 제거했다.
- `docs/` ignore를 해제해 신규 지식 문서가 Git 변경으로 노출되도록 했다.
- 서비스별 검증 스크립트와 Vercel/Railway production 배포 스크립트를 추가했다.
- GitHub Actions에 전체 Quality Gates와 수동 production 배포 workflow를 구성했다.
- Railway Go 서비스 healthcheck를 `/health`로 표준화하고 5개 production backend를 always-on으로 설정했다.

## 검증

- Vite: `yarn build` 성공, 4,130 modules. main JS 약 3,138.68 kB 경고는 기존 기술 부채로 유지.
- FastAPI gateway: pytest 12 passed.
- Spring: Gradle test 성공.
- AI: Python compileall 성공.
- Expo mobile: lint, typecheck, static server 2 tests, web export 성공.
- YAML, JSON, shell syntax, Compose config, `git diff --check` 성공.
- `REDIS_HOST_PORT=6380 docker compose up -d --build` 성공. Go canvas/serve를 포함한 전체 이미지 빌드 및 10개 컨테이너 실행 확인.
- 로컬 web, gateway, Spring, canvas, serve, AI, mobile HTTP 200 확인.

## Cloud 배포

- Vercel `flownote-react`
  - deployment: `dpl_93YbPgSTJpj8nqjDPN5tkBhBG2sd`
  - status: READY
  - production alias: `https://flownote-react.vercel.app`
  - `/`, `/planner`: 200
- Railway `flownote-canvas`
  - deployment: `9bda2242-48c4-48fd-bf02-b9844e0a6a7d`
  - status: SUCCESS
  - healthcheck: `/health`
- Railway `flownote-serve`
  - deployment: `7b3ff85d-60de-4e71-a051-f5cbcbbfbed5`
  - status: SUCCESS
  - healthcheck: `/health`
- Railway `flownote-ai`
  - deployment: `ec59f562-2ece-43d9-97b1-8adf9b232b02`
  - status: SUCCESS
- Railway `flownote-main`
  - deployment: `1362b704-3541-456f-b412-541c29dd0a22`
  - status: SUCCESS
- Railway `flownote-api`
  - deployment: `8321d249-d018-49c1-9257-5a5ee67650c3`
  - status: SUCCESS
- Railway `flownote-api`, `flownote-main`, `flownote-canvas`, `flownote-serve`, `flownote-ai`
  - 최신 deployment manifest에서 `sleepApplication=false` 확인
  - 전체 service status SUCCESS

## 운영 확인

always-on 적용 전 `/api/mobile/config` 첫 요청에서 upstream Spring cold start로 502가 1회 재현됐다. backend sleep 해제 후 같은 경로를 연속 5회 호출해 모두 200(약 0.64~0.88초)을 확인했다. 이 정책은 첫 요청 안정성을 높이는 대신 Railway 대기 비용을 증가시킨다.

## 남은 항목

- GitHub repository에 `RAILWAY_TOKEN`, `VERCEL_TOKEN` secrets와 `RAILWAY_PROJECT_ID`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` variables를 등록해야 수동 production workflow를 실행할 수 있다.
- 웹 ESLint와 전체 TypeScript gate는 아직 실패하므로 Quality Gates의 필수 항목에 포함하지 않았다.
- Expo patch version 권고와 웹/모바일 대형 bundle 경고는 별도 의존성·성능 작업으로 처리한다.
