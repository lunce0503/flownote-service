# Flownote Mobile

Expo Router 기반 모바일 앱입니다. `EXPO_PUBLIC_WAS_URL`로 지정한 Flownote Spring API에 연결해 로그인, 회원가입, 작업, 노트를 사용할 수 있습니다.

## 실행

```bash
npm install
EXPO_PUBLIC_WAS_URL=http://<LAN_IP>:8080 npm run start
```

Android/iOS 시뮬레이터로 바로 열 때는 각각 `npm run android`, `npm run ios`를 사용합니다.

앱은 `EXPO_PUBLIC_WAS_URL`의 `/api/mobile/config`를 호출해 서버 설정을 확인하고, 같은 API 기준 URL로 `/api/users`, `/api/tasks`, `/api/notes`를 호출합니다. 실기기에서 테스트할 때는 `localhost`가 휴대폰 자신을 가리키므로 개발 PC의 LAN 주소를 사용해야 합니다.

## Docker로 실행

루트 `docker-compose.yml`에는 `mobile-app` 서비스가 포함되어 있습니다. 루트 `.env`의 `HOST_LAN_IP`를 모바일 기기에서 접근 가능한 개발 PC 주소로 설정한 뒤 실행합니다.

```bash
HOST_LAN_IP=192.168.0.10 docker compose up --build mobile-app
```

실행 후 로그에서 Expo QR을 확인합니다.

```bash
docker compose logs -f mobile-app
```

Spring WAS 모바일 설정 환경 변수 예시:

```bash
MOBILE_CORE_API_URL=http://192.168.0.10:8080
MOBILE_AI_API_URL=http://192.168.0.10:8000
MOBILE_WEB_URL=http://192.168.0.10:5173
MOBILE_ENABLED_FEATURES=webview,auth,tasks,notes,canvas,agent
```

## 검증

```bash
npm run lint
```

현재 앱은 Expo SDK 54와 `expo-router`를 사용합니다. 의존성이 없는 환경에서는 먼저 `npm install` 또는 Docker 빌드를 실행해야 합니다.
