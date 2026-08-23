# 플래너 main 병합 및 운영 재배포

## 작업 범위

- `origin/main`의 PR #2 병합 커밋 `646b44b`를 로컬 `main`에 통합했다.
- 병합 대상은 할 일, 반복 시간표, 날짜별 일기를 `/planner` 단일 화면으로 통합한 변경이다.
- 기존 미커밋 모바일 Railway 배포 작업은 `07a2c19`로 먼저 보존했다.
- 최종 병합 커밋 `34a2c8b`를 `origin/main`에 푸시했다.

## 기능 확인

- `/planner`가 내비게이션과 홈 바로가기의 플래너 진입점이다.
- 일간 화면은 선택 날짜의 요일을 계산하고 활성 반복 일정만 `오늘의 시간표`에 표시한다.
- 할 일, 시간표 필기, `오늘 있었던 일` 저널은 날짜별 diary API로 저장된다.
- 기존 `/task`, `/diary` 화면 링크와 프로스토어 바로가기 문구는 현재 웹 소스에 없다.
- 피드백 API는 FastAPI gateway의 `feedback` 접두어를 통해 Go `flownote-serve`로 전달된다.

## 검증 결과

- `flownote`: `yarn build` 성공.
- 플래너 및 피드백 변경 범위 ESLint 성공.
- `flownote-API`: `uv run pytest -q` 성공, 12 tests passed.
- `flownote-mobile`: `npm test -- --runInBand` 성공, 2 tests passed.
- 로컬 호스트에는 Go CLI가 없어 `go test ./...`는 실행하지 못했다. 대신 전체 Docker 빌드에서 `flownote-serve` Go 바이너리 컴파일에 성공했다.
- 전체 `yarn lint`는 병합 범위 밖의 기존 캔버스, 마법, 주식 등에서 65 errors, 13 warnings로 실패했다. 플래너 대상 lint에는 오류가 없다.
- `REDIS_HOST_PORT=6380 docker compose up -d --build` 성공. 호스트 6379의 관련 없는 Redis를 유지하기 위해 6380을 사용했다.
- 로컬 `/planner`는 HTTP 200, Spring/Canvas/Serve health는 HTTP 200을 반환했다.

## 클라우드 배포

### Vercel production

- 프로젝트: `flownote-react`
- Deployment ID: `dpl_6RteizHjfUNrgMkKqiRtsD13usfd`
- 상태: `READY`
- 기본 URL: `https://flownote-react.vercel.app`
- 배포 URL: `https://flownote-react-kczveckus-flownote-service.vercel.app`
- 운영 `/planner`에서 새 번들 `index-CbFUE2Al.js`와 `플래너`, `오늘의 시간표`, `오늘 있었던 일` 문구를 확인했다.

### Railway production

- `flownote-api`: deployment `02a0a318-4df7-45dc-b272-e78861dec37b`, `SUCCESS`.
- `flownote-serve`: deployment `7632a0d4-aa2e-484d-8b43-97db6277c189`, `SUCCESS`.
- Gateway URL: `https://flownote-api-production.up.railway.app`
- `/`는 HTTP 200과 `flownote-api-gateway` UP 상태를 반환했다.
- 비로그인 `/api/diary`, `/api/feedback`은 각각 HTTP 401을 반환했다. 이는 502/라우팅 실패가 아니라 Serve까지 도달한 정상 인증 계약이다.

## 최종 상태

- `main`과 `origin/main`은 `34a2c8b`에서 동기화됐다.
- 소스 작업 트리는 clean이다. 이 보고서는 `logs/report/` 전용 기록이므로 추가 Docker 빌드와 클라우드 배포를 생략한다.
