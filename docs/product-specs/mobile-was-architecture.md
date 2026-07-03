# 모바일 WAS 아키텍처

Flownote 모바일 앱은 Spring Boot WAS를 설정 진입점으로 사용한다. 앱은 시작 시 `EXPO_PUBLIC_WAS_URL`의 `/api/mobile/config`를 호출하고, WAS가 응답한 `web_url`을 iOS/Android 네이티브 WebView로 연다.

## 구성

- `flownote-server`: 모바일 설정을 관리하는 WAS다.
- `flownote-mobile`: Expo 기반 iOS/Android 앱이다.
- `flownote-API`: AI API URL로 노출될 수 있는 Python 서비스다.
- `flownote/`, `flownote-next/`: 기존 웹 클라이언트다.

## 설정 흐름

1. 모바일 앱이 `EXPO_PUBLIC_WAS_URL`을 읽는다.
2. 모바일 앱이 `GET /api/mobile/config`를 호출한다.
3. Spring WAS가 `MOBILE_CORE_API_URL`, `MOBILE_AI_API_URL`, `MOBILE_WEB_URL`, `MOBILE_MIN_SUPPORTED_VERSION`, `MOBILE_ENABLED_FEATURES` 기반 응답을 반환한다.
4. 모바일 앱은 응답의 `enabled_features`에서 `webview`가 활성화되어 있는지 확인한다.
5. 모바일 앱은 응답의 `minimum_supported_version`으로 현재 앱 버전 지원 여부를 확인한다.
6. 모바일 앱은 응답의 `web_url`을 `react-native-webview`로 렌더링한다.

## 주요 파일

- `flownote-server/src/main/java/com/flownote/mobile/MobileConfigController.java`
- `flownote-server/src/main/resources/application.yml`
- `docker-compose.yml`
- `flownote-mobile/src/api/client.ts`
- `flownote-mobile/App.tsx`

## 로컬 실행

```bash
cd flownote-mobile
yarn install
cp .env.example .env
yarn start
```

실기기에서는 `localhost` 대신 개발 PC의 LAN IP를 사용한다.

```bash
EXPO_PUBLIC_WAS_URL=http://192.168.0.10:8080 yarn start
```

## Docker 실행

루트에서 모바일용 compose 실행 스크립트를 사용한다.

```bash
./scripts/docker-mobile-up.sh
```

이 스크립트는 개발 PC의 LAN IP를 감지해서 휴대폰 접근용 모바일 URL을 compose 실행 환경에 주입한 뒤 `spring-server`, `react-app`, `mobile-app`을 `--build`로 실행한다.

자동 감지가 잘못되면 직접 지정한다.

```bash
HOST_LAN_IP=192.168.0.10 ./scripts/docker-mobile-up.sh
```

Expo QR 로그는 아래 명령으로 본다.

```bash
docker compose logs -f mobile-app
```

## EAS 빌드

`flownote-mobile/eas.json`은 Expo EAS 문서의 build profile 구조를 따른다.

- `development`: 내부 배포 및 iOS simulator 빌드
- `preview`: 내부 테스트용 Android APK/iOS internal distribution
- `production`: 스토어 제출용 빌드

EAS 원격 빌드는 로컬 `.env` 파일을 사용하지 않으므로 `EXPO_PUBLIC_WAS_URL`은 EAS 환경변수로 등록한다.

```bash
cd flownote-mobile
yarn eas:env:preview --value https://your-was.example.com
yarn build:android
```

운영 빌드는 공개 HTTPS WAS 주소를 production 환경에 등록한 뒤 실행한다.

```bash
yarn eas:env:production --value https://your-was.example.com
yarn build:android:production
yarn build:ios:production
```

Spring WAS도 같은 LAN 기준 URL을 내려주도록 설정한다.

```bash
MOBILE_CORE_API_URL=http://192.168.0.10:8080
MOBILE_AI_API_URL=http://192.168.0.10:8000
MOBILE_WEB_URL=http://192.168.0.10:5173
MOBILE_MIN_SUPPORTED_VERSION=1.0.0
MOBILE_ENABLED_FEATURES=webview,auth,tasks,notes,canvas,agent
```

`MOBILE_ENABLED_FEATURES`는 쉼표로 구분된 기능 목록이다. 모바일 앱은 현재 `webview`가 포함된 경우에만 웹앱 화면을 연다.
앱 버전을 올릴 때는 `flownote-mobile/package.json`, `flownote-mobile/app.json`, `flownote-mobile/App.tsx`의 버전 값을 함께 변경한다.

개발 중 실기기에서 LAN의 HTTP 웹 주소를 열 수 있도록 Android cleartext traffic과 iOS ATS 예외를 설정했다. 운영 환경에서는 `MOBILE_WEB_URL`을 HTTPS 주소로 설정한다.

## 검증

루트에서 전체 게이트를 순서대로 실행:

```bash
./scripts/verify-mobile-was.sh
```

로컬에서는 Java 17과 `flownote-mobile/yarn.lock`, `flownote-mobile/node_modules`가 없으면 위 스크립트가 실패한다. GitHub Actions는 Java 17과 Node.js를 준비하지만, 모바일 lockfile이 커밋되어 있어야 진행된다.

의존성 설치 전에도 가능한 정적 검증:

```bash
cd flownote-mobile
yarn verify
```

모바일 의존성 설치 후 실제 Expo 타입 검증:

```bash
cd flownote-mobile
yarn install
yarn typecheck
```

`flownote-mobile/yarn.lock`은 첫 `yarn install` 이후 생성해서 커밋한다. CI는 설치 전에 lockfile 존재 여부를 확인하고 `yarn install --frozen-lockfile`로 의존성을 설치한다.
lockfile을 커밋한 뒤에는 `.github/workflows/mobile-was.yml`의 `cache-dependency-path`에 `flownote-mobile/yarn.lock`도 추가한다.

Spring WAS 계약 테스트:

```bash
cd flownote-server
./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest
```

통합 배포 전 Compose 설정 확인:

```bash
docker compose config --services
```

Java 17과 모바일 의존성 설치가 끝난 뒤 위 검증이 모두 통과하면 `docker compose up -d --build`로 배포한다.

GitHub Actions에서는 `.github/workflows/mobile-was.yml`이 Java 17과 Node.js 20.19를 준비하고 `./scripts/verify-mobile-was.sh`를 실행한다.
