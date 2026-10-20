# iOS/iPadOS TestFlight

## 범위와 현재 상태

기존 `flownote-mobile` Expo 네이티브 클라이언트를 EAS macOS 클라우드에서 빌드한다. Mac을 소유하지 않아도 빌드·업로드할 수 있다. Apple Developer 유료 멤버십과 App Store Connect 권한이 필요하다.

Windows/Android의 웹 셸과 다른 구현이다. 계정·작업·노트·캔버스 등 기존 Expo 기능이 대상이며 최신 웹 기능 전체의 동등 구현을 의미하지 않는다. 최초 서명 연결 전에는 IPA/TestFlight 설치 완료로 보고하지 않는다.

- Expo: `@lunce02/flownote-mobile`, project ID `0026ed46-eac0-4368-88ec-51f945829eb0`.
- iPhone/iPad 공용 bundle ID: `com.flownote.mobile`, `supportsTablet: true`.
- Expo SDK 54를 유지하고 공식 SDK 54용 Xcode 26.0 이미지를 명시한다. `latest` 자동 선택으로 대규모 SDK 이전을 유발하지 않는다.
- `production`: store archive, 운영 Railway API, remote build number 자동 증가.
- `testflight`: store archive, staging Railway API. 같은 bundle ID이므로 production 빌드와 동시에 설치하지 않으며 환경을 구분해 검증한다.
- development/preview의 internal 배포는 TestFlight용이 아니다.
- 시스템 HTTPS 외 비면제 암호화를 추가하지 않았으므로 `ios.config.usesNonExemptEncryption: false`. 암호화 기능이 바뀌면 재검토한다.
- 루트 `.easignore`는 Expo 소스만 허용하고 인증 파일·환경 파일·다른 서비스·생성물을 업로드하지 않는다.

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

`npm run lint`, `npm run typecheck`, `npm run test`와 iOS 배포 번들 export를 확인한다. EAS archive inspect로 앱 소스/자산/lockfile 포함과 비밀 파일 제외를 확인한다. Linux 번들 성공은 Xcode 컴파일·Apple 서명·실제 iPad 실행 검증을 대체하지 않는다.

## 근거

- [Expo TestFlight 안내](https://docs.expo.dev/submit/testflight/)
- [EAS iOS 제출](https://docs.expo.dev/submit/ios/)
- [EAS 빌드 이미지](https://docs.expo.dev/build-reference/infrastructure/)
- [Apple 2026 SDK 최소 요구사항](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)
