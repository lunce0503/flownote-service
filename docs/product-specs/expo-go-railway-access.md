# Railway production Expo Go 접근

## 목표

개인 iPhone, iPad, Android 휴대폰과 태블릿의 Expo Go에서 Flownote React Native 앱을 열고 Railway production API의 동일 계정 데이터를 사용한다.

## 서비스 경계

- `flownote-mobile-production`: Safari/브라우저용 Expo Web 정적 클라이언트다.
- `flownote-expo-go`: Expo Go가 manifest와 JavaScript bundle을 받는 production Metro 서비스다.
- `flownote-api`: 모바일 앱이 호출하는 단일 공개 API gateway다.
- `flownote-main`, `flownote-canvas`, `flownote-serve`, `flownote-ai`: gateway 뒤의 production 서비스다.

Expo Go 서비스는 production 환경에 있지만 개발 서버 프로토콜을 제공한다. 앱 코드는 `--no-dev --minify`로 번들하고, API 비밀값은 포함하지 않는다. QR 주소를 아는 사용자는 JavaScript bundle을 내려받을 수 있으므로 서버 API는 항상 로그인과 사용자 소유권을 검증해야 한다.

## 접속 주소

현재 production 접속값은 다음과 같다.

```text
Expo Go project URL: exps://flownote-expo-go-production.up.railway.app
Manifest HTTPS URL: https://flownote-expo-go-production.up.railway.app
Production API: https://flownote-api-production.up.railway.app
```

`exps://`는 Expo Go가 HTTPS manifest를 여는 주소다. Railway의 정적 모바일 웹 URL은 Expo Go 프로젝트 주소가 아니므로 혼동하지 않는다.

이 단계는 Expo Go가 앱 컨테이너 역할을 하므로 Apple 유료 개발자 계정이나 iOS 서명이 필요하지 않다. 이후 독립 설치형 iPad 앱을 만들 때 별도로 Xcode와 Apple 무료 계정 서명 절차를 진행한다.

## iPhone과 iPad

1. App Store에서 **Expo Go**를 설치한다.
2. iPhone 또는 iPad의 기본 카메라로 제공된 QR 코드를 스캔한다.
3. `Expo Go에서 열기`를 선택한다.
4. 처음 번들을 내려받는 동안 화면을 닫지 않는다.
5. 최초 로그인 화면에서 기존 Flownote 계정으로 로그인한다.
6. 홈에서 노트·작업·Canvas·Agent 중 사용할 기능을 선택한다.
7. 기능의 상위 목록에서 항목을 고르고 하위 상세/편집 화면으로 이동한다.

QR이 열리지 않으면 Expo Go를 실행한 뒤 project URL을 직접 입력한다. iPad에서는 세로·가로 방향 모두 확인한다.

## Android 휴대폰과 태블릿

1. Google Play에서 **Expo Go**를 설치한다.
2. Expo Go를 실행하고 **Scan QR code**를 선택한다.
3. 카메라 권한을 허용하고 제공된 QR 코드를 스캔한다.
4. 직접 입력이 필요하면 Expo Go에 project URL을 붙여넣는다.
5. 최초 한 번 Flownote 계정으로 로그인하고 홈에서 사용할 기능을 선택한다.
6. 노트·작업·Canvas 목록에서 항목을 고른 뒤 상세/편집 화면을 확인한다.

## 기능 확인 순서

1. 로그인 후 앱을 다시 열었을 때 로그인 화면이 아니라 홈으로 이동하는지 확인한다.
2. 홈 → 작업 목록 → 작업 상세에서 작업을 만들고 수정한 뒤 웹에서 같은 작업이 보이는지 확인한다.
3. 홈 → 노트 목록 → 노트 상세에서 일반 텍스트 노트를 편집하고 웹에서 제목과 본문을 비교한다.
4. 웹 서식 노트는 모바일에서 본문이 읽기 전용이고 제목만 안전하게 저장되는지 확인한다.
5. 홈 → Canvas 목록 → Canvas 편집에서 간단한 선을 그린 뒤 저장·재로드한다.
6. 웹에서 같은 Canvas를 열어 결과를 비교한다.
7. 앱을 백그라운드로 보냈다가 돌아와 로컬 초안 복구를 확인한다.

현재 모바일 Canvas 저장 계약은 별도 안정화가 필요한 영역이므로 중요한 원본 데이터보다 테스트 문서로 먼저 검증한다.

## 장애 대응

- **QR이 웹 브라우저로 열림**: 정적 웹 URL이 아니라 `exps://` project URL인지 확인한다.
- **There was a problem loading the project**: Expo Go를 완전히 종료하고 다시 스캔한다. 서비스 `/`가 HTTP 200인지 확인한다.
- **SDK 호환 오류**: Flownote는 Expo SDK 54를 사용한다. 기기의 Expo Go가 SDK 54를 지원하는지 확인한다.
- **로그인 또는 데이터 요청 실패**: `https://flownote-api-production.up.railway.app/api/mobile/config`가 응답하는지 확인한다.
- **첫 접속이 느림**: Railway 배포 상태와 Metro 로그를 확인한다.

## 운영 및 롤백

배포 전 `cd flownote-mobile && npm run verify`를 실행한다. production 배포 후 Expo manifest의 `launchAsset.url`이 동일한 Railway HTTPS domain을 가리키는지 확인하고 iOS·Android bundle URL이 모두 200인지 확인한다.

새 배포가 실패하면 `flownote-expo-go`의 이전 성공 deployment를 Railway에서 redeploy한다. 정적 서비스인 `flownote-mobile-production`은 별도 서비스이므로 Expo Go 롤백의 영향을 받지 않는다.
