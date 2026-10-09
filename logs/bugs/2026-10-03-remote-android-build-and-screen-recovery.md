# Android 원격 터미널 빌드와 화면 복구

## 증상·원인

- 첫 CI는 `setup-android@v3` 기본값의 폐기된 SDK `tools` 패키지를 찾지 못해 실패했다. 지원 패키지를 명시했다.
- 다음 CI는 emulator runner가 script 각 줄을 별도 셸에서 실행하여 `cd` 다음 줄의 `./gradlew`를 찾지 못했다. 전용 실행 스크립트로 경로와 결과 수집을 고정했다.
- Kotlin 테스트의 wildcard import가 앱 `Protocol`과 OkHttp `Protocol`을 동시에 가져와 컴파일에 실패했다. 앱 프로토콜을 명시적으로 import했다.
- xterm의 비동기 출력 처리 전에 `reset()`을 호출하면 이전 세션의 큐가 새 화면에 기록될 수 있었다. 초기화를 출력 큐 순서에 넣고 이전 generation의 ACK를 무시한다.
- Activity 재생성 시 ViewModel이 유지되고 WebView만 교체되면 이전 ANSI 화면은 없는데 증분 attach를 시도할 수 있었다. 새 WebView의 ready를 감지하면 연결 객체를 다시 생성하고 저장된 세션을 복구 불가 상태로 취급한다.
- 출력 유실 후에도 출력 프레임을 누적할 수 있었다. 복구 불가 상태에서는 출력을 무시하고 새 세션 선택 전 입력도 차단한다.
- AndroidView의 WebView 크기를 명시하지 않아 최초 터미널이 비어 보였다. `MATCH_PARENT`를 명시한 뒤 첫 출력·한글 입력·재접속이 통과했다.
- 가로 화면에서 IME·헤더·명령 입력창·도구줄이 터미널 공간을 모두 차지했다. 실제 실패 DOM의 `innerHeight`는 0이고 xterm은 한 줄로 축소됐다. 가로/작은 화면에서는 짧은 상태 표시와 입력·도구 한 줄 배치를 사용하고 WebView를 경계에 맞춰 clip한다. xterm은 일시적으로 가용 공간이 줄어들면 5줄 미만으로 축소하지 않는다.

## 회귀 검증

### 2026-10-09 회전 후 출력 갱신

- CI `37122413485`는 CONNECTED 및 양수 WebView 크기에도 `ROTATE_OK`가 표시되지 않았다. 연결 실패와 화면 갱신 실패를 구분한다.
- 화면 높이 기반 `BoxWithConstraints` 대신 화면 방향/크기 기반 compact 모드를 사용해 IME 전환 시 composition 구조가 바뀌지 않도록 했다.
- WebView 정리는 `AndroidView.onRelease`가 소유하고, 이전 View가 새 View의 renderer를 해제하지 않도록 동일 인스턴스인지 확인한다.
- 네이티브 명령 전송은 xterm의 사용자 입력 경로를 거치지 않으므로, 성공 시 `scrollToBottom()`으로 최신 프롬프트를 표시한다. 출력 수신만으로 스크롤을 강제하지 않는다.
- 브리지 회귀 테스트와 같은 Android 수용 시험을 재실행한다. 실제 통과 여부는 릴리즈 보고서에 기록한다.

- `apps/android/terminal/test/bridge.test.mjs`: 중복 ACK, 큐 초기화, 입력 활성화, 출처와 OSC52.
- `ConnectionTest.kt`: 재접속 seq, 입력 재전송 금지, 화면 손실, replay 오류, 폐기·잘못된 응답.
- `RemoteAppTest.kt`: 실제 Host와 등록·터미널·재접속·Activity 재생성.
- 최종 실행 결과는 해당 릴리스의 `logs/report/` 기록을 기준으로 한다.
