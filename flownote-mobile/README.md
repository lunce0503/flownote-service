# Flownote Mobile

Expo Router 기반 iOS/Android/Web 클라이언트다. 계정, 작업, 노트, AI, 캔버스 화면을 React Native로 직접 렌더링하며 `EXPO_PUBLIC_WAS_URL`의 Flownote FastAPI 게이트웨이를 단일 공개 API 진입점으로 사용한다.

## 화면 구조

앱은 최초 진입 시 세션을 확인해 로그인 또는 홈으로 이동한다. 로그인 이후에는 홈이 상위 기능 진입점이며, 목록과 상세/편집 라우트를 분리한다.

```text
/login
/home
/tasks        → /tasks/:taskId
/notes        → /notes/:noteId
/canvas       → /canvas/:canvasId
/agent
```

노트·작업·Canvas의 상위 라우트는 생성과 목록 탐색을 담당하고, 항목 선택 후 하위 라우트에서 편집과 삭제를 수행한다.

## iPad 클라우드 테스트

Expo Go에서 `exps://flownote-expo-go-staging-staging.up.railway.app`을 열어 staging을 테스트한다. Safari 테스트 주소는 `https://flownote-mobile-staging.up.railway.app`이다. 개발 PC의 Metro/LAN 주소는 사용하지 않는다.

## Railway 웹 테스트 배포

`npm run build:web`은 Expo 정적 웹 결과를 `dist/`에 생성한다. `Dockerfile`의 기본 production 단계와 `railway.json`은 결과물을 `$PORT`에서 제공하고 `/health`를 헬스체크로 노출한다.

Railway 배포본은 iPad Safari에서 열 수 있고 웹 매니페스트를 사용해 홈 화면에 추가할 수 있다. 이는 무료 Apple 계정으로 필기 UX를 검증하기 위한 웹 테스트 클라이언트이며 TestFlight/App Store 네이티브 배포를 대체하지 않는다.

배포는 루트의 `node scripts/deploy-cloud.mjs release all`로 staging 검증 후 production 순서로 진행한다. `Dockerfile`은 Railway 빌드 전용이며 로컬 Compose는 폐기됐다.

## 검증

```bash
npm run verify
```

`verify`는 ESLint, TypeScript, 정적 서버 테스트, Expo 웹 프로덕션 빌드를 순서대로 실행한다.

## 네이티브 배포

`eas.json`의 development/preview는 staging, production은 운영 게이트웨이를 사용한다. Apple 서명·배포 조건은 사용하는 EAS 배포 방식에서 확인한다. 표준 절차는 [배포 기준](../docs/DEPLOYMENT.md)을 따른다.
