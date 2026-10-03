# Android 원격 터미널

소유 구현은 `apps/android/`이다. 앱은 등록된 PC의 `remote-host` 프로토콜 v1과 직접 WSS로 통신한다. 기존 Flownote 웹/Expo 클라우드 클라이언트의 API 목적지 규칙과 별개의 명시적 PC 원격 접속 제품이다.

## 사용자 흐름

PC 등록 → 지문 대조 → TLS·토큰 인증 → hello → PTY 생성 → ANSI 출력 및 입력 → 재접속 또는 명시적 종료.

등록 데이터는 PC 이름, WSS endpoint, 토큰과 인증서 지문이다. 토큰을 URL 또는 로그에 포함하지 않는다. Android Keystore AES-GCM으로 암호화한 등록 데이터를 앱 전용 저장소에 보관하며 백업과 캡처를 금지한다.

## 경계

- Kotlin/Compose가 인증, 연결 상태와 생명주기를 소유한다. xterm.js는 앱에 포함된 WebView에서 화면·IME·ANSI만 처리한다.
- 인증서는 등록된 SHA-256 지문, 유효 기간과 호스트명이 모두 일치해야 한다. 자동 재신뢰와 trust-all은 없다.
- WebView 자산은 `appassets.androidplatform.net`의 고정된 출처로 제공한다. 브리지는 메인 프레임과 출처를 확인한다. 외부 탐색·리소스·클립보드 자동 쓰기를 차단한다.
- 입력 스트림을 재전송하지 않는다. 붙여넣기는 8KiB UTF-8 청크로 순서대로 전송하며 JSON 이스케이프 후 Host 64KiB 제한을 만족한다.
- 앱 메모리의 xterm 상태와 처리 완료 seq를 함께 유지할 때만 재접속한다. 앱 재시작·재생 버퍼 초과 시 새 세션 선택을 요구한다.
- 백그라운드에서는 연결을 해제하며 복귀 시 같은 화면으로 재접속한다. Host는 기존 정책에 따라 최대 5분간 PTY를 유지한다.

## 배포와 검증

GitHub Actions `Remote Android`가 Android SDK 35로 APK를 빌드하고 JVM 단위 테스트, Android lint와 에뮬레이터 수용 시험을 실행한다. 태그 `remote-android-v*`의 릴리스는 이 검증을 통과한 동일 소스만 사용한다. 서명 정보는 GitHub Actions secrets에 보관한다. Android 앱에 별도 Railway 서비스는 필요하지 않다.

코드맵·설치·명령은 [`../../apps/android/README.md`](../../apps/android/README.md), Host 경계는 [`remote-host.md`](remote-host.md)를 참조한다. 실제 기기 IME·장시간 사용·PC Codex의 대화형 호환 시험은 자동화된 에뮬레이터 시험과 구분해서 결과를 기록한다.
