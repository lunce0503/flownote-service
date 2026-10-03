# Flownote Remote Android

Android 10 이상에서 Linux 또는 Windows의 `remote-host`에 직접 WSS로 연결하는 터미널 앱이다. 원격 데스크톱 화면 전송이 아닌 실제 PC 셸을 제공한다. Host 0.2.0의 프로토콜 v1을 사용하며 같은 LAN 또는 기존 VPN이 필요하다.

## 설치와 접속

1. GitHub Release의 `flownote-remote-v0.1.0.apk`를 휴대폰에서 설치한다.
2. PC에서 [Remote Host](../host/README.md)를 설치하고 `remote-host init --host <LAN_OR_VPN_IP> --bind <LAN_OR_VPN_IP>`를 실행한다.
3. `remote-host serve`를 실행한다. Windows 방화벽은 사용자가 신뢰하는 사설 네트워크 범위에서만 허용한다.
4. 앱에 PC 이름, `wss://<host>:7443/v1/connect`, 기기 토큰과 SHA-256 인증서 지문을 입력한다. `init --json` 출력은 JSON 가져오기로 등록할 수 있다.
5. PC 화면의 지문과 앱에 입력한 값을 대조하고 확인란을 선택해 연결한다.

터미널 도구줄에는 Esc, Tab, Ctrl, Alt, Ctrl+C, 방향키, 붙여넣기와 입력창이 있다. 입력창은 한글 조합이 끝난 명령을 전송 버튼으로 보낼 수 있다. 여러 줄 붙여넣기는 전송 전 내용을 확인한다. 설정에서 글자 크기를 바꿀 수 있다.

연결 해제는 PC PTY를 최대 5분간 유지한다. 앱이 같은 터미널 화면을 유지하는 동안에만 증분 출력을 복원한다. 앱 프로세스가 종료됐거나 재생 버퍼를 벗어난 경우 새 세션을 명시적으로 시작한다. 입력은 재접속 후 재전송하지 않는다. 앱을 백그라운드로 보내면 연결을 해제하고 복귀 시 재연결한다.

## 보안과 수명

- 인증서 전체 DER의 SHA-256 지문과 유효 기간을 검증하고 OkHttp의 기본 호스트명 검증을 유지한다.
- 토큰은 Android Keystore AES-GCM 키로 암호화해 앱 전용 저장소에 보관한다. 백업과 앱 화면 캡처는 비활성화한다.
- WebView는 앱 번들 자산만 표시한다. 브리지는 `https://appassets.androidplatform.net` 메인 프레임만 허용하며 토큰을 JavaScript에 전달하지 않는다.
- 외부 탐색, 파일 접근, 팝업, 외부 리소스와 OSC52 클립보드 쓰기를 차단한다.
- PC 계정의 전체 셸 권한으로 실행되므로 공용 인터넷에 Host 포트를 노출하지 않는다.
- 원격 PC의 Codex 같은 CLI는 해당 PC에서 별도로 설치·인증해야 한다.

## 빌드

Java 17, Android SDK 35, Node.js와 npm이 필요하다.

```bash
cd apps/android/terminal
npm ci
npm run build
cd ..
./gradlew testDebugUnitTest lintDebug assembleDebug
```

테스트 APK는 `app/build/outputs/apk/debug/app-debug.apk`다. GitHub Actions의 Android 에뮬레이터가 실제 Host를 시작해 연결·터미널·재접속을 검증한다. `remote-android-v*` 태그는 이 검증을 통과한 후 저장소 전용 서명키로 APK를 릴리스한다. 서명키는 GitHub Actions secrets에 등록하고 운영자 전용 위치에 권한 제한된 복구 사본을 보관한다. 키·비밀번호는 저장소에 넣지 않는다. 테스트 Host의 일회용 토큰은 배포 APK에 포함하지 않는다.

## 코드맵

| 경로 | 책임 |
| --- | --- |
| `app/.../MainActivity.kt`, `RemoteViewModel.kt` | 앱 생명주기, 등록 상태와 터미널 화면 연결 |
| `app/.../ui/RemoteApp.kt` | 등록·상태·터미널·붙여넣기 화면 |
| `app/.../connection/` | 프로토콜, 세션, 재접속과 입력 제한 |
| `app/.../security/` | 인증서 지문 검증, Keystore 암호화 저장 |
| `app/.../terminal/TerminalView.kt` | 제한된 WebView와 출처 검증 브리지 |
| `app/src/main/assets/terminal/` | xterm.js UI, 출력 처리 완료 ACK, 크기 변경 |
| `terminal/` | 버전 고정된 xterm.js 번들 생성 |
| `app/src/androidTest/` | 실제 Host와 Android 앱 통합 수용 시험 |

PC 구현과 공유 계약은 [`../host/`](../host/README.md), [`../../protocol/remote-host/v1/`](../../protocol/remote-host/v1/protocol.schema.json)를 참고한다.
