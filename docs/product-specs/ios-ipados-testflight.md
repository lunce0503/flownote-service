# iOS/iPadOS TestFlight

## 범위와 현재 상태

기존 `flownote-mobile` Expo 네이티브 클라이언트를 EAS macOS 클라우드에서 빌드한다. Mac을 소유하지 않아도 빌드·업로드할 수 있다. Apple Developer 유료 멤버십과 App Store Connect 권한이 필요하다.

1.0.0은 별도 Expo 네이티브 화면이었다. 1.1.0부터 iOS/iPadOS 진입점은 WKWebView로 같은 환경의 `flownote/` 웹 화면·API를 공유한다. Notes·Canvas·Planner·설정·소셜·AI 및 개발 중 기능의 공개/권한 상태도 웹을 따른다. 사용자 권한이나 중지된 AI 서버를 우회해 기능을 활성화하지 않는다. 기존 Expo Android/웹 테스트 클라이언트는 유지한다.

앱 UI는 `FlownoteIOS/<version>` UA로 식별한다. 원래 Flownote 헤더를 숨기고 아이보리·검정 테마와 앱 하단 탐색을 사용한다. 목록→상세/편집 라우터와 Canvas 전체 작업 영역은 웹과 같다. 일반 iPad Safari는 앱으로 식별하지 않는다. iOS safe area는 네이티브가 관리하고 강제 새로고침/뒤로 스와이프로 필기를 중단하지 않는다.

WKWebView의 persistent website data store에 웹의 HttpOnly 세션 쿠키와 기기 초안을 보관한다. 기존 Expo Bearer 토큰을 읽거나 웹에 주입하지 않으므로 1.0.0→1.1.0 전환 시 한 번 다시 로그인해야 한다. 서버 저장 자료는 같은 계정으로 보이고, 기존 네이티브 로컬 초안은 삭제하지 않지만 웹에 자동 이관하지 않는다. 기기 전용 PDF도 웹/다른 기기에 자동 전송되지 않는다.

- Expo: `@lunce02/flownote-mobile`, project ID `0026ed46-eac0-4368-88ec-51f945829eb0`.
- iPhone/iPad 공용 bundle ID: `com.flownote.mobile`, `supportsTablet: true`.
- Expo SDK 54를 유지하고 공식 SDK 54용 Xcode 26.0 이미지를 명시한다. `latest` 자동 선택으로 대규모 SDK 이전을 유발하지 않는다.
- `production`: store archive, 운영 Vercel 웹과 Railway API, remote build number 자동 증가.
- `testflight`: store archive, staging Vercel 웹과 Railway API. `EXPO_PUBLIC_WEB_URL`은 두 고정 origin 중 하나만 허용하고 잘못된 설정을 production으로 fallback하지 않는다. 같은 bundle ID이므로 production 빌드와 동시에 설치하지 않으며 환경을 구분해 검증한다.
- development/preview의 internal 배포는 TestFlight용이 아니다.
- 시스템 HTTPS 외 비면제 암호화를 추가하지 않았으므로 `ios.config.usesNonExemptEncryption: false`. 암호화 기능이 바뀌면 재검토한다.
- 루트 `.easignore`는 Expo 소스만 허용하고 인증 파일·환경 파일·다른 서비스·생성물을 업로드하지 않는다.
- App Store Connect 앱 ID `6824777358`는 실제 성공한 최초 제출에서 확인했다. 서명/제출 키는 EAS 원격 저장소에 두고 소스에 넣지 않는다.

## 연결·파일 처리

동일 고정 HTTPS origin만 WebView 내부에서 탐색한다. 외부 HTTPS/mailto/tel은 사용자 확인 후 외부 앱에서 열고 HTTP/file/data/javascript/intent·URL credential은 차단한다. 프레임/HTML 메시지에 일반적인 네이티브 API나 파일 읽기·임의 HTTP·토큰 접근을 제공하지 않는다. 컨텐츠 프로세스 종료·오류 시 재연결 버튼을 제공하며 쿠키/데이터를 지우지 않는다. 오프라인 완전 편집은 보장하지 않는다.

iOS Info.plist의 ATS는 임의 HTTP·로컬 네트워킹을 허용하지 않고 예외 도메인은 비워 둔다. 시스템 사진/카메라/동영상 마이크 권한 설명을 명시하며, WebView의 웹 API 미디어 캡처는 자동 허용하지 않는다. SDK 54 범위의 권장 패치를 적용하고 `expo install --check`를 통과시킨다.

파일 입력은 WKWebView 시스템 선택기를 사용한다. 노트 Markdown·원본/초안 JSON·플래너 ICS는 공유 웹의 내보내기 경로에서 bounded data 메시지로 전달한다. native는 메시지 origin·정확한 schema·MIME allowlist·base64·8MiB 한도·정리된 파일명을 검증하고, 사용자가 확인해야 앱 cache에 쓰고 iOS 공유 메뉴를 연다. ‘파일에 저장’으로 저장하며 끝나면 임시 파일을 삭제한다. 다른 메시지·네트워크 URL 다운로드·임의 경로 쓰기는 허용하지 않는다. 추가 형식은 계약/테스트를 함께 확장한다.

## 최초 빌드와 제출

이 프로젝트가 열린 개발 환경의 터미널에서 사용자가 직접 실행한다.

```bash
cd /home/kwon/Flownote/service/flownote-mobile
npx eas-cli@latest build --platform ios --profile production --auto-submit --no-wait
```

EAS에 연결된 Expo 계정과 Apple 유료 계정이 다를 수 있다. Apple 로그인 질문에 동의하고 Apple ID·비밀번호·2단계 인증을 터미널에서만 입력한다. 인증서와 provisioning profile은 EAS의 안내로 생성한다. 기존 인증서를 무단 폐기하지 않는다. App Store Connect 앱 생성과 제출 키 연결도 최초에 필요할 수 있다. 앱 이름 충돌/약관/권한/키 문제가 나오면 해당 단계에서 해결한다. 비밀번호·인증 코드·개인키를 채팅·저장소·보고서에 넣지 않는다.

실제 build ID와 submission ID를 기록한다. `--no-wait`의 성공은 빌드와 제출 완료를 의미하지 않는다. EAS 페이지에서 빌드 FINISHED와 제출 성공, Apple 처리 완료를 각각 확인한다. 제출이 별도로 필요하면 정확한 기존 build ID를 선택해 `eas submit --platform ios --id <build-id>`로 진행하고 중복 빌드를 만들지 않는다. 최초 비대화형 실행은 원격 서명·제출 인증 설정 후에만 사용한다.

## iPad 설치

1. iPad App Store에서 Apple의 TestFlight를 설치한다.
2. App Store Connect → 내 앱 → Flownote → TestFlight에서 빌드 처리를 확인한다.
3. 내부 테스트 그룹에 빌드를 추가하고 본인의 App Store Connect 사용자를 테스터로 추가한다. 앱 접근 권한과 적절한 역할이 필요하다.
4. 해당 Apple 계정으로 iPad 초대 링크를 열고 TestFlight에서 설치한다. 외부 테스터는 별도의 Beta App Review가 필요할 수 있다.
5. 로그인, 앱 종료 후 세션 복구, 노트/캔버스 저장과 웹 재조회, 가로/세로 전환 및 필기를 확인한다. 운영 자료를 자동 생성/삭제하는 시험은 하지 않는다.

TestFlight 제출은 공개 App Store 심사·출시 요청과 별개다. 설치 초대 URL은 Apple 처리가 끝나고 테스트 그룹을 구성한 후에만 제공할 수 있다.

## 검증

`npm run lint`, `npm run typecheck`, `npm run test`와 iOS 배포 번들 export를 확인한다. EAS archive inspect로 앱 소스/자산/두 lockfile 포함과 비밀 파일 제외를 확인한다. 고정 cloud staging의 Chromium/WebKit에서 iPhone/iPad 너비별 로그인·세션 reload·전체 메뉴·Markdown cloud 저장·정확한 export payload·ICS·Canvas pointer 저장을 검증한다. WebKit 자동화는 실제 WKWebView 프로세스 재시작 쿠키 복구·시스템 파일 선택/공유 UI·Apple Pencil 압력/손바닥 거부를 보증하지 않는다. 이 항목은 실제 iPad TestFlight 설치 후 확인한다.

단순 웹 래퍼의 공개 App Store 심사 승인을 보장하지 않는다. 현재 배포 범위는 기존 앱의 TestFlight 내부 테스트다.

## 근거

- [Expo TestFlight 안내](https://docs.expo.dev/submit/testflight/)
- [EAS iOS 제출](https://docs.expo.dev/submit/ios/)
- [EAS 빌드 이미지](https://docs.expo.dev/build-reference/infrastructure/)
- [Apple 2026 SDK 최소 요구사항](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
