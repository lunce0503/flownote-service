# Flownote Mobile

Expo Router 기반 iOS/Android/Web 클라이언트다. 계정, 작업, 노트, AI, 캔버스 화면을 React Native로 직접 렌더링하며 `EXPO_PUBLIC_WAS_URL`의 Flownote FastAPI 게이트웨이를 단일 공개 API 진입점으로 사용한다.

## iPad 개발 실행

Expo Go를 설치한 iPad에서 QR 코드를 열어 테스트한다. 운영 Railway API를 사용할 때는 다음과 같이 실행한다.

```bash
cd flownote-mobile
EXPO_PUBLIC_WAS_URL=https://flownote-api-production.up.railway.app npm run start -- --tunnel
```

로컬 통합 백엔드를 사용할 때 `localhost`는 iPad 자신을 가리키므로 개발 PC의 LAN 주소와 FastAPI 게이트웨이 포트 `8000`을 사용한다.

```bash
EXPO_PUBLIC_WAS_URL=http://192.168.0.10:8000 npm run start
```

## Railway 웹 테스트 배포

`npm run build:web`은 Expo 정적 웹 결과를 `dist/`에 생성한다. `Dockerfile`의 기본 production 단계와 `railway.json`은 결과물을 `$PORT`에서 제공하고 `/health`를 헬스체크로 노출한다.

Railway 배포본은 iPad Safari에서 열 수 있고 웹 매니페스트를 사용해 홈 화면에 추가할 수 있다. 이는 무료 Apple 계정으로 필기 UX를 검증하기 위한 웹 테스트 클라이언트이며 TestFlight/App Store 네이티브 배포를 대체하지 않는다.

```bash
npm run build:web
npm run start:web
```

## 로컬 Docker

루트 Compose의 `mobile-app`은 Dockerfile의 `development` 단계를 사용해 Expo 개발 서버를 실행한다.

```bash
HOST_LAN_IP=192.168.0.10 docker compose up --build mobile-app
docker compose logs -f mobile-app
```

## 검증

```bash
npm run verify
```

`verify`는 ESLint, TypeScript, 정적 서버 테스트, Expo 웹 프로덕션 빌드를 순서대로 실행한다.

## 네이티브 배포

`eas.json`의 preview/production 프로필은 Railway 운영 게이트웨이를 사용한다. 실제 iOS 기기용 development build, TestFlight, App Store 배포에는 Apple Developer Program 권한이 필요하다.
