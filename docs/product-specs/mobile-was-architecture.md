# 모바일 클라이언트 아키텍처

Flownote 모바일은 Expo Router 기반 React Native 클라이언트다. WebView로 기존 웹 앱을 감싸지 않고 계정, 작업, 노트, 에이전트, 캔버스를 네이티브 컴포넌트로 직접 렌더링한다.

## 내비게이션 구조

앱의 최초 진입점은 저장된 세션 유무를 확인한다. 세션이 없으면 `/login`, 세션이 있으면 `/home`으로 이동한다. 로그인과 회원가입이 성공하면 탭 화면에 머물지 않고 홈으로 교체 이동하며, 로그아웃하면 보호된 앱 Stack 전체가 다시 로그인으로 돌아간다.

```text
/
├─ /login
└─ /home
   ├─ /tasks → /tasks/:taskId
   ├─ /notes → /notes/:noteId
   ├─ /canvas → /canvas/:canvasId
   └─ /agent
```

`/tasks`, `/notes`, `/canvas`는 생성과 탐색을 담당하는 상위 목록 라우트다. 사용자가 항목을 선택하면 ID가 포함된 하위 상세 라우트에서 편집·삭제·세부 기능을 수행한다. `/agent`는 별도 목록이 없는 단일 기능 화면이므로 홈에서 직접 진입한다.

웹 서식, 이미지 또는 하위 블록을 포함한 노트는 모바일 일반 텍스트 편집기로 변환 저장하지 않는다. 하위 노트 화면에서 본문은 읽기 전용으로 표시하고 제목만 저장해 원본 BlockNote 구조를 보존한다.

## 서비스 경계

- `flownote-mobile`: iOS/Android 네이티브 앱과 Railway용 정적 웹 테스트 클라이언트다.
- `flownote-API`: 모바일이 호출하는 단일 공개 HTTP 게이트웨이다.
- `flownote-server`: 인증, 사용자, `/api/mobile/config`를 소유한다.
- `flownote-canvas`: 캔버스 문서·폴더·요소·이미지와 노트 API를 소유한다.
- `flownote-serve`: 작업과 기타 부가 기능 API를 소유한다.
- `flownote-ai`: 에이전트 API를 소유한다.

## 통신 흐름

1. 빌드 또는 개발 실행 시 `EXPO_PUBLIC_WAS_URL`을 공개 FastAPI 게이트웨이 URL로 주입한다.
2. 계정, 작업, 노트, 캔버스 요청은 같은 게이트웨이의 `/api/**`를 호출한다.
3. 보호 API는 Spring이 발급한 세션 UUID를 `Authorization: Bearer <token>`으로 전달한다.
4. 게이트웨이는 경로에 따라 Spring, Go canvas, Go serve, Python AI 서비스로 요청을 전달한다.
5. `/api/mobile/config` 응답은 운영 URL과 최소 지원 버전 표시용이다. 일반 데이터 API의 기준 URL은 빌드에 주입한 게이트웨이다.
6. GET 요청은 12초 타임아웃을 사용하고 502·503·504 또는 네트워크 실패 시 700ms, 1.4초 간격으로 최대 두 번 재시도한다. 변경 요청은 중복을 피하기 위해 자동 재시도하지 않는다.

운영 기본 URL은 다음과 같다.

```text
https://flownote-api-production.up.railway.app
```

`EXPO_PUBLIC_*` 값은 앱 번들에 공개되므로 비밀값을 넣지 않는다.

## 캔버스 동작

`app/canvas.tsx`는 선, 이미지, 텍스트 상자를 SVG로 렌더링한다. 펜, 지우개, 올가미, 이동, 텍스트, 색상 선택, 이미지 추가, 2점 확대·이동, 실행 취소를 제공한다.

변경 내용은 AsyncStorage 로컬 초안에 먼저 기록하고 700ms 디바운스 후 `/api/canvas/save`로 자동 저장한다. 앱이 비활성 상태로 전환될 때도 로컬 초안과 서버 저장을 시도한다. 서버 로드 실패 시 해당 캔버스의 로컬 초안이 있으면 복원한다.

현재 입력은 일반 React Native 터치 좌표다. Apple Pencil 압력·기울기·전용 팜 리젝션은 지원하지 않으며 PencilKit 기반 네이티브 캔버스로 전환할 때 별도 development build가 필요하다.

## 실행 형태

### Expo Go

무료 Apple 계정으로 iPad 실기기에서 네이티브 컴포넌트 동작을 확인한다.

```bash
cd flownote-mobile
EXPO_PUBLIC_WAS_URL=https://flownote-api-production.up.railway.app npm run start -- --tunnel
```

### 로컬 Docker

루트 Compose는 `flownote-mobile/Dockerfile`의 `development` 단계를 사용해 Expo 개발 서버를 `8081`에 실행한다.

```bash
HOST_LAN_IP=192.168.0.10 docker compose up --build mobile-app
```

### Railway 웹 테스트

Dockerfile의 최종 production 단계는 `expo export --platform web` 결과를 정적 서버로 제공한다. `/health`는 Railway 헬스체크이며 공개 HTTPS URL은 iPad Safari와 홈 화면 바로가기에서 사용한다.

이 배포는 Apple 서명 없이 개인 iPad에서 필기 UX를 확인하기 위한 경로다. 네이티브 `.ipa`, TestFlight, App Store 배포는 Expo EAS와 Apple Developer Program을 사용한다.

### Railway Expo Go

production의 `flownote-expo-go` 서비스는 Expo Go용 Metro manifest와 bundle을 제공한다. 기존 `flownote-mobile-production` 정적 웹 서비스와 staging의 `flownote-mobile` 서비스에서 분리하며, `EXPO_PACKAGER_PROXY_URL`을 Railway HTTPS domain으로 고정한다. 모바일 앱의 API 기준은 계속 `EXPO_PUBLIC_WAS_URL=https://flownote-api-production.up.railway.app`이다.

휴대폰과 태블릿 접속 절차 및 장애 대응은 `expo-go-railway-access.md`를 따른다.

## 운영 설정

Spring 모바일 설정에는 localhost가 아닌 공개 HTTPS 주소를 지정한다.

```text
MOBILE_CORE_API_URL=https://flownote-api-production.up.railway.app
MOBILE_AI_API_URL=https://flownote-api-production.up.railway.app
MOBILE_WEB_URL=<Railway flownote-mobile public URL>
MOBILE_MIN_SUPPORTED_VERSION=1.0.0
MOBILE_ENABLED_FEATURES=auth,tasks,notes,canvas,agent
```

브라우저 기반 Railway 모바일 클라이언트를 제공할 때 해당 공개 origin을 `flownote-api`의 `CORS_ORIGINS`에 추가한다.

## 검증

```bash
cd flownote-mobile
npm ci
npm run verify

cd ..
docker compose up -d --build
```

배포 후 `/health`, `/api/mobile/config`, 인증이 필요한 `/api/canvas/documents`의 CORS와 상태 코드를 확인한다.
