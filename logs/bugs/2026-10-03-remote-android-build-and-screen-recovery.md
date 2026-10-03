# Android 원격 터미널 빌드와 화면 복구

## 증상·원인

- 첫 CI는 `setup-android@v3` 기본값의 폐기된 SDK `tools` 패키지를 찾지 못해 실패했다. 지원 패키지를 명시했다.
- 다음 CI는 emulator runner가 script 각 줄을 별도 셸에서 실행하여 `cd` 다음 줄의 `./gradlew`를 찾지 못했다. 전용 실행 스크립트로 경로와 결과 수집을 고정했다.
- Kotlin 테스트의 wildcard import가 앱 `Protocol`과 OkHttp `Protocol`을 동시에 가져와 컴파일에 실패했다. 앱 프로토콜을 명시적으로 import했다.
- xterm의 비동기 출력 처리 전에 `reset()`을 호출하면 이전 세션의 큐가 새 화면에 기록될 수 있었다. 초기화를 출력 큐 순서에 넣고 이전 generation의 ACK를 무시한다.
- Activity 재생성 시 ViewModel이 유지되고 WebView만 교체되면 이전 ANSI 화면은 없는데 증분 attach를 시도할 수 있었다. 새 WebView의 ready를 감지하면 연결 객체를 다시 생성하고 저장된 세션을 복구 불가 상태로 취급한다.
- 출력 유실 후에도 출력 프레임을 누적할 수 있었다. 복구 불가 상태에서는 출력을 무시하고 새 세션 선택 전 입력도 차단한다.

## 회귀 검증

- `apps/android/terminal/test/bridge.test.mjs`: 중복 ACK, 큐 초기화, 입력 활성화, 출처와 OSC52.
- `ConnectionTest.kt`: 재접속 seq, 입력 재전송 금지, 화면 손실, replay 오류, 폐기·잘못된 응답.
- `RemoteAppTest.kt`: 실제 Host와 등록·터미널·재접속·Activity 재생성.
- 최종 실행 결과는 해당 릴리스의 `logs/report/` 기록을 기준으로 한다.
