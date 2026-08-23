# iPad 캔버스 Railway 배포 결과

## 범위

- `flownote-mobile`의 기존 React Native 캔버스를 iPad에서 Expo Go 또는 Railway 웹 테스트 클라이언트로 사용할 수 있게 배포 경로를 구성했다.
- Railway 웹 배포는 Apple 서명 없이 Safari와 홈 화면 바로가기에서 메모, 회의 필기, 아이디어 스케치, 개인 화이트보드를 시험하기 위한 경로다.
- 네이티브 TestFlight/App Store 배포는 이 범위에 포함하지 않는다.

## 구현

- Expo 웹 정적 빌드와 Node 표준 라이브러리 기반 정적 서버를 추가했다.
- `/health`, 확장자 없는 Expo Router 경로, SPA fallback, 정적 자산 캐시와 경로 탈출 차단을 구현했다.
- 웹 매니페스트와 iPad 홈 화면 메타데이터를 추가했다.
- 앱 표시 이름을 `Flownote`로 정리하고 가로·세로 방향을 허용했다.
- EAS preview/production과 Railway 웹 빌드가 `https://flownote-api-production.up.railway.app`을 사용하도록 설정했다.
- 모바일 GET 요청에 12초 타임아웃과 700ms/1.4초 지연 재시도를 추가했다. 변경 요청은 중복 위험 때문에 자동 재시도하지 않는다.
- Compose는 Dockerfile의 `development` 타깃을 사용하고 Railway는 최종 production 타깃을 사용한다.
- `flownote-ai/.dockerignore`를 추가해 호스트 `.venv`가 컨테이너 가상환경을 덮는 기존 exit 127 문제를 해결했다.

## 검증

- `npm run verify`: ESLint, TypeScript, 정적 서버 테스트 2개, Expo 웹 정적 빌드 성공.
- production Docker 이미지: `/health` 200, `/canvas` 200 확인.
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 모든 이미지 빌드와 컨테이너 기동 성공.
- 기본 실행은 다른 프로젝트의 `village-finance-redis`가 호스트 `6379`를 사용해 실패했으며, 해당 컨테이너를 변경하지 않고 Flownote Redis 호스트 포트를 `6380`으로 지정했다.
- 로컬 gateway와 AI 루트 헬스체크 200 확인.

## Railway production

| 서비스 | Deployment ID | 결과 |
| --- | --- | --- |
| `flownote-mobile-production` | `d5cf463b-98d4-4c1d-acd8-da2ed34aa222` | SUCCESS |
| `flownote-api` | `27205a3a-2576-4364-9ab4-9791455d2b11` | SUCCESS, CORS 갱신 |
| `flownote-main` | `576580c6-b4d0-483a-9cea-d7cd85b19d13` | SUCCESS, 모바일 URL 갱신 |
| `flownote-ai` | `fff9be50-3a36-43e9-868c-0d4afc554581` | SUCCESS, uvicorn 기동 확인 |

모바일 공개 URL:

```text
https://flownote-mobile-production-production.up.railway.app
```

공개 검증:

- 모바일 `/health`: 200, `flownote-mobile` UP.
- 모바일 `/canvas`: 200 HTML.
- 모바일 `/manifest.json`: standalone, orientation any.
- API `/api/mobile/config`: core/AI는 gateway, web은 모바일 공개 URL, `auth,tasks,notes,canvas,agent` 반환.
- 모바일 origin의 CORS preflight: 200, `access-control-allow-origin` 일치.
- 인증 없는 `/api/canvas/documents`: CORS 헤더를 포함한 예상된 401.

첫 production 업로드 `ca7a3a4e-80f6-4015-b862-e5356d3f25e6`은 모노레포 루트를 업로드해 `railway.json`을 찾지 못하고 실패했다. 이후 `railway up . --path-as-root`로 모바일 디렉터리를 배포 루트로 지정해 해결했다.

## 잔여 위험

- 실제 Apple Pencil 압력·기울기·Pencil 전용 팜 리젝션은 구현되지 않았다.
- 로그인된 실제 사용자로 캔버스 생성·저장·재로드하는 production 종단 테스트는 사용자 자격 증명이 없어 수행하지 않았다. 공개 라우팅과 인증 경계까지 확인했다.
- `npm audit --omit=dev`는 모두 간접 의존성에서 low 1, moderate 13, high 5, critical 2를 보고했다. Railway production 최종 이미지에는 Expo 빌드용 `node_modules`를 복사하지 않지만, Expo SDK 업그레이드 계획에서 잠금 파일을 갱신해야 한다.
- 최초 staging 컨텍스트에서 생성된 빈 `flownote-mobile` 서비스가 남아 있다. 운영 배포 서비스는 별도 `flownote-mobile-production`이며, 빈 staging 서비스 삭제는 파괴적 작업이라 수행하지 않았다.
