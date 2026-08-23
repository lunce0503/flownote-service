# 스테이징(테스트) 환경 구축 — Railway + Vercel 복제

작성 2026-07-20 13:00 UTC. 프로덕션과 분리된 테스트 서버를 만들고, 검증 후 프로덕션으로 승격하는 흐름을 구성했다. Cloudflare R2는 같은 계정·자격증명을 재사용하되 데이터는 별도 버킷으로 격리했다.

## 목표

- `railway`/`vercel`에 올라간 서버를 복제해 **테스트 전용 스테이징**을 구성한다.
- **R2는 그대로 이용**하되(같은 계정·엔드포인트·키), 프로덕션 파일 오염을 막기 위해 데이터는 분리한다.
- 스테이징에서 검증 → 프로덕션 서버로 승격하는 경로를 만든다.

## 결과 요약 (모두 가동 확인)

**Railway** 프로젝트 `flownote`에 새 환경 `staging`(id `7e60dd1e-4183-42b2-a88f-19be7cdd6373`)을 `production` fork로 생성.

| 서비스 | staging 상태 | 공개/사설 |
| --- | --- | --- |
| flownote-api (게이트웨이) | SUCCESS · UP | https://flownote-api-staging.up.railway.app |
| flownote-canvas | SUCCESS · UP | https://flownote-canvas-staging.up.railway.app |
| flownote-main (Spring, 인증) | SUCCESS · `{"status":"UP"}` | https://flownote-main-staging.up.railway.app |
| flownote-serve (Go) | SUCCESS | 사설 |
| flownote-ai (FastAPI) | SUCCESS | 사설 |
| Postgres | RUNNING | staging 전용 인스턴스(`tokaido.proxy.rlwy.net:57254`) |
| Redis | RUNNING | staging 전용 인스턴스 |

**Vercel** 팀 `flownote-service`에 새 프로젝트 `flownote-react-staging` 생성 → https://flownote-react-staging.vercel.app (HTTP 200). 배포 `dpl_HrXPYWqf7Lm9VaMFyEZ7Y9YthN86`.

## 격리 보장 (검증 완료)

- **DB 격리**: fork가 staging 전용 Postgres/Redis를 새 볼륨으로 생성. 내부 도메인 `postgres.railway.internal`은 환경별로 재해석되어 staging 안에선 staging DB를 가리킴. 공개 프록시 호스트가 프로덕션(`kodama...:15755`)과 다름(`tokaido...:57254`)으로 별도 인스턴스임을 확인. 스키마는 각 서비스 첫 배포 시 Flyway/Go 초기화로 생성.
- **R2 스토리지(프로덕션과 공유)**: 사용자 결정에 따라 staging은 프로덕션과 **같은 버킷 `flownote-r2-storage`**를 그대로 사용한다(같은 계정·엔드포인트·키·공개 URL). 별도 버킷을 만들지 않으므로 이미지 업로드/조회가 즉시 동작한다. `FLOWNOTE_STORAGE_VALIDATE_ON_STARTUP=true`(프로덕션과 동일). ⚠ **주의: staging 테스트의 업로드/삭제가 프로덕션 R2 파일에 직접 영향**을 준다(버킷 공유). 파일 저장소 계층은 격리되지 않는다 — DB/Redis는 완전 격리.
- **프론트 격리(빌드타임 확증)**: staging 번들에 `flownote-api-staging.up.railway.app` 8회 등장, 프로덕션 게이트웨이(`flownote-api-production...`)·프로덕션 next(`flownote-next.vercel.app`) **0회**. 즉 staging 프론트는 staging 백엔드에만 붙는다.
- **프로덕션 무손상**: 소스 파일 변경 없음(git clean). 프로덕션 게이트웨이 배포 후에도 `{"status":"UP"}` 유지.

### staging 프론트 환경변수(`flownote-react-staging`, Production 스코프)

모두 staging 게이트웨이(`https://flownote-api-staging.up.railway.app`)를 가리킴: `VITE_API_BASE_URL`, `VITE_AI_BASE_URL`, `VITE_CORE_API_URL`, `VITE_CANVAS_API_URL`, `VITE_CANVAS_SOCKET_URL`, `VITE_API_BASE_URL2`.

## R2 결정 이력

초기엔 안전을 위해 staging 전용 버킷 `flownote-staging`으로 분리 구성했으나(부팅검증 off + placeholder 공개 URL), **사용자 결정으로 프로덕션과 같은 버킷 `flownote-r2-storage`를 공유**하도록 되돌렸다(main·canvas·serve에서 `FLOWNOTE_STORAGE_BUCKET`·`FLOWNOTE_STORAGE_PUBLIC_BASE_URL`을 프로덕션 값으로, main·canvas는 `VALIDATE_ON_STARTUP=true`로 복원, 변수 변경이 재배포를 트리거). 별도 버킷 수동 생성 불필요, 업로드 즉시 동작. 트레이드오프는 위 "R2 스토리지(프로덕션과 공유)" 주의 참조.

## 알려진 스코프 경계

- **크로스디바이스 sync(next 기반 `/api/sync/*`)는 staging에서 비활성**. react가 이 기능에만 `flownote-next`를 쓰는데, 프로덕션 next/DB 오염을 막기 위해 staging에선 프로덕션 next로 보내지 않는다(미설정 → staging 게이트웨이로 fallback되어 무해하게 미동작). 필요 시 `flownote-next-staging` 프로젝트를 staging Postgres/Redis에 연결해 별도로 세운다(후속).

## 스테이징 재배포 / 프로덕션 승격 흐름

`flownote/` 디렉터리 링크는 안전을 위해 **프로덕션(`flownote-react`)으로 원복**해 두었다. 스테이징에 다시 배포할 때만 임시 링크한다.

- **백엔드 staging 재배포**: `railway up ./<subproject> --path-as-root --service <svc> --environment staging --detach` (예: `flownote-API`→`flownote-api`, `flownote-server`→`flownote-main`, `flownote-canvas`/`flownote-serve`/`flownote-ai` 동일명).
- **프론트 staging 재배포**: `cd flownote && vercel link --yes --project flownote-react-staging && vercel --prod --yes && cp <백업>/vercel-react-link-backup.json .vercel/project.json`(링크 원복).
- **프로덕션 승격**: 백엔드는 동일 명령에서 `--environment production`, 프론트는 프로덕션 링크 상태로 `vercel --prod`.

## 검증 생략 사유

- `docker compose up -d --build`·프로덕션 서비스 배포: **저장소 소스 파일 변경 없음**(순수 클라우드 스테이징 프로비저닝). 로컬 통합 compose 검증은 이번 변경과 무관하므로 생략. 실제 클라우드 반영(=스테이징 구축)은 본 작업에서 직접 수행·검증했다.

## 산출 식별자

- Railway staging env: `7e60dd1e-4183-42b2-a88f-19be7cdd6373`
- Vercel 프로젝트: `flownote-react-staging` / 배포 `dpl_HrXPYWqf7Lm9VaMFyEZ7Y9YthN86`
- staging 진입점: 프론트 https://flownote-react-staging.vercel.app · 게이트웨이 https://flownote-api-staging.up.railway.app
