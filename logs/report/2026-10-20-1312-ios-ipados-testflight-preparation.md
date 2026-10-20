# iOS/iPadOS EAS·TestFlight 준비

2026-10-20 KST. 사용자가 Apple 멤버십 활성화를 알리고 기존 Windows/Android 릴리스 마무리와 함께 TestFlight iPad 설치를 요청했다.

## 변경과 확인

- 기존 Expo SDK 54 네이티브 클라이언트 `flownote-mobile`을 유지한다. 웹 셸로 재작성하거나 웹 전체 기능이 동등하다고 주장하지 않는다.
- 로그인된 Expo 계정의 `@lunce02/flownote-mobile`, project ID `0026ed46-eac0-4368-88ec-51f945829eb0` 연결 확인 후 app.json에 반영했다. Apple 개인정보나 인증값은 기록하지 않았다.
- iPhone/iPad `com.flownote.mobile`과 supportsTablet을 유지했다. store 프로필, SDK 54용 Xcode 26.0 이미지, 비면제 암호화 없음 설정, staging store 프로필을 추가했다.
- TDD: 설정 검사 2개가 먼저 실패함을 확인한 뒤 최소 설정 변경 후 전체 scripts 테스트 7개 통과. lint·typecheck 통과. 운영 API를 명시한 `expo export --platform ios` 성공, Hermes iOS bundle 약 4.35MB. 원래 프로젝트의 미커밋 노트 변경은 보존했다.
- SDK 54를 유지하되 Apple 2026-04-28 이후 요구하는 Xcode 26/iOS 26 SDK를 충족하는 공식 이미지를 선택했다. 원격 Xcode 컴파일 성공은 아직 확인하지 않았다.
- EAS 업로드 범위를 mobile 소스로 제한하고 환경 파일/서명키/다른 서비스/생성물을 제외하는 루트 `.easignore`를 추가했다. 최종 `build:inspect --stage archive` 성공: 약 1.7MB, 최상위 `flownote-mobile`만 포함하며 앱 설정·자산·lockfile·소스를 확인했다. 환경 파일/서명키/다른 서비스/생성물은 없었다. 초기 ignore의 디렉터리 끝 슬래시가 EAS 복사 필터의 디렉터리 경로와 맞지 않아 빈 결과를 만들었고 제외/허용 디렉터리 규칙을 수정한 뒤 다시 검증했다. 빈 archive는 업로드하지 않았다.

## 실제 빌드 시도와 차단점

최신 EAS CLI 25.2.0을 임시 도구 경로에 설치했다. `eas project:info`로 연결 성공을 확인했다. `eas build --platform ios --profile production --non-interactive --no-wait`는 원격 buildNumber 1 초기화 후 `Credentials are not set up`으로 종료했다. 원격 iOS build 목록은 `[]`다. 즉 IPA 빌드 job은 아직 생성되지 않았다.

대화형 `build --profile production --auto-submit --no-wait`는 remote buildNumber 2로 증가한 뒤 Apple 로그인 동의에서 멈췄다. 비밀번호/2FA를 채팅으로 받지 않고 Ctrl-C로 종료했다. 번호가 증가한 것은 빌드 성공이 아니다. 사용자가 자신의 터미널에서 최초 Apple 로그인·서명·제출 연결을 해야 한다. 추측한 Apple ID/team/ascAppId/API key를 쓰지 않았다.

사용자가 터미널 여는 방법을 요청해 OpenAI 공식 문서의 Ctrl+백틱 통합 터미널 단축키와 Linux 프로젝트 경로를 안내했다. 현재 사용자 인증 대기이며 TestFlight 빌드/제출/테스트 초대 URL은 없다. [소유 문서](../../docs/product-specs/ios-ipados-testflight.md)에 재개 명령과 iPad 설치 절차가 있다.

## 배포 경계

Windows/Android 운영 릴리스는 [완료 보고서](2026-10-20-1243-windows-android-auto-update-release.md)를 따른다. 해당 배포는 변경 전 고정 snapshot으로 staging 55/55 후 같은 fingerprint의 production READY를 확인했다.

이번 iOS 추가는 EAS 패키징·연결 설정이며 서버/API 런타임 변화가 없어 별도 Railway 모바일 웹/Expo Go 재가동과 backend 재배포를 하지 않았다. 소유 문서도 EAS 절차를 기록했으며 native 배포 경로는 Apple 인증 후 위 EAS 명령이다. 실제 iPad의 앱 종료/로그인 유지/노트·캔버스 동기화 검증은 TestFlight 설치 후 남아 있다.
