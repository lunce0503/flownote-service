# Flownote Mobile

Expo 기반 모바일 앱이다. 앱은 Spring WAS의 `/api/mobile/config`를 먼저 호출해 백엔드에서 관리되는 Web URL을 받아온 뒤, iOS/Android 네이티브 WebView 안에서 Flownote 웹앱을 연다.

## 실행

Expo SDK 55 기준으로 Node.js 20.19 이상이 필요하다.

```bash
yarn install
cp .env.example .env
yarn start
```

처음 의존성을 설치한 뒤 생성되는 `yarn.lock`은 모바일 앱 재현성을 위해 함께 커밋한다.

앱 버전을 올릴 때는 `package.json`의 `version`, `app.json`의 `expo.version`/`expo.runtimeVersion`, `App.tsx`의 `MOBILE_APP_VERSION`을 함께 변경한다. `yarn verify`가 이 값들의 동기화를 확인한다.

Android/iOS 시뮬레이터로 바로 열 때는 각각 `yarn android`, `yarn ios`를 사용한다.

앱은 `EXPO_PUBLIC_WAS_URL`에 지정된 Spring WAS에서 `/api/mobile/config`를 호출한다. 이후 WAS가 응답한 `web_url`을 `react-native-webview`로 렌더링하므로 앱 업데이트 없이 백엔드 설정만으로 모바일에서 열 웹 주소를 바꿀 수 있다.

## Docker로 실행

루트에서 아래 스크립트를 실행하면 Spring WAS, Vite 웹앱, Expo 모바일 개발 서버를 자동 빌드하고 실행한다.

```bash
./scripts/docker-mobile-up.sh
```

스크립트는 개발 PC의 LAN IP를 자동 감지해서 `EXPO_PUBLIC_WAS_URL`, `MOBILE_WEB_URL`, `MOBILE_CORE_API_URL`, `MOBILE_AI_API_URL`을 휴대폰에서 접근 가능한 주소로 맞춘다. 자동 감지가 맞지 않으면 직접 지정한다.

```bash
HOST_LAN_IP=192.168.0.10 ./scripts/docker-mobile-up.sh
```

실행 후 로그에서 Expo QR을 확인한다.

```bash
docker compose logs -f mobile-app
```

휴대폰에서는 Expo Go로 QR을 스캔한다. iOS/Android 휴대폰과 개발 PC는 같은 네트워크에 있어야 한다.

실기기에서 테스트할 때는 `localhost`가 휴대폰 자신을 가리키므로 `EXPO_PUBLIC_WAS_URL`과 서버의 `MOBILE_CORE_API_URL`을 개발 PC의 LAN 주소로 지정한다.

```bash
EXPO_PUBLIC_WAS_URL=http://192.168.0.10:8080 yarn start
```

Spring WAS 환경 변수 예시:

```bash
MOBILE_CORE_API_URL=http://192.168.0.10:8080
MOBILE_AI_API_URL=http://192.168.0.10:8000
MOBILE_WEB_URL=http://192.168.0.10:5173
MOBILE_ENABLED_FEATURES=webview,auth,tasks,notes,canvas,agent
```

개발 중 LAN의 HTTP 주소를 WebView로 열 수 있도록 Android `usesCleartextTraffic`와 iOS ATS 예외를 설정해 두었다. 운영 배포에서는 `MOBILE_WEB_URL`을 HTTPS 주소로 설정한다.

## 검증

```bash
yarn verify
yarn verify:contract
yarn verify:local-types
yarn typecheck
```

`verify`는 의존성 설치 전에도 실행 가능한 계약/보조 타입 검증을 함께 수행한다. `verify:contract`는 WAS 설정 호출, `web_url` WebView 렌더링, iOS/Android 로컬 HTTP 접근 설정을 확인한다. `verify:local-types`는 기존 Vite 앱의 TypeScript와 임시 Expo/React Native shim으로 앱 코드의 기본 타입 오류를 확인한다. `typecheck`는 `yarn install` 이후 실행한다.
