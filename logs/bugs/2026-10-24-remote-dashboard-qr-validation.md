# 원격 대시보드·QR 연결 검증

## 범위

`flownote-remote` 0.3.0의 기능 카드·클라이언트 사용 토글·세부 메뉴·QR 연결을 검증한다. 메인 웹/인증/클라우드 서비스는 변경하지 않는다.

## 구현 중 발견해 수정한 문제

- `dotnet build tests/Flownote.Remote.Windows.Checks -c Release`: 라이선스 버튼의 XAML 이름 ShowLicenses와 새 static 메서드가 겹쳐 CS0102가 발생했다. 공개 메서드를 OpenLicenses로 바꾸고 교차 빌드를 통과했다. 새 음성 대상 조건의 id 변수 충돌 CS0136도 이름을 분리해 수정했다.
- UI 상태 갱신에서 기기가 중지 상태이면 항상 camera.stop을 보내고, 서버의 camera.stop 처리가 다시 UI 갱신을 호출하면 순환할 수 있다. 실제 카메라/QR 스캔이 켜져 있을 때만 중지 메시지를 한 번 보낸다. 중지 토글은 heartbeat 이후에도 상태가 유지되는지 EXE/Android 실행 검사로 확인한다.
- 이전 연결의 비동기 UI 이벤트가 새 연결이나 해제 뒤 화면을 덮을 수 있다. Windows는 현재 연결 객체와 일치할 때만 이벤트를 반영하고, Android는 세션 generation을 확인한다. 서버 종료가 끝나면 최종 꺼짐 상태를 다시 표시한다.
- 카메라 시작 오류 뒤 토글만 꺼지고 스트림이 남을 수 있어 WebView2 JavaScript 오류 경로에서도 tracks를 중지한다. QR 취소·서버 해제·Activity onStop에서도 캡처를 중지한다.
- Android 연결 확인 창을 닫은 뒤 늦게 등록 응답이 와도 자동 연결하지 않도록 진행 중 요청의 generation을 취소한다. QR 스캔으로 이동할 때 기존 확인 창과 임시 코드를 정리한다.
- QR 코드 2분 유효 시간이 기기 테스트의 전체 컴파일 시간을 포함하지 않도록 debug/instrumentation APK를 먼저 컴파일하고 fixture를 시작한다. 이후 실제 초대 asset만 다시 패키징한다. 제품 유효 시간은 늘리지 않는다.
- 첫 EXE 검사(39977681494)의 UI 동작은 통과했으나 screenshot에서 runner의 1024×768 작업 영역보다 초기 창이 커 가장자리와 아래쪽이 잘렸다. 초기 대시보드/설정/세부 창을 실제 작업 영역 안으로 제한한다. screenshot은 상단 카드와 아래 클라이언트 목록을 별도로 스크롤해 기록하고 QR 창을 캡처하지 않는다.
- 같은 실행의 Android `connectedDebugAndroidTest`는 QR에 담긴 fixture 서버 주소가 호스트 loopback이라 에뮬레이터 자신의 127.0.0.1로 접속해 ConnectException으로 실패했다. 시험 초대에만 에뮬레이터가 호스트로 연결하는 기존 10.0.2.2 별칭을 사용한다. 실제 앱의 QR은 선택한 PC 사설 IPv4를 그대로 사용하며 HTTP/로컬 fallback을 추가하지 않는다. 후속 장치 검사에서 QR→TLS→UI 연결을 다시 검증한다.
- 후속 EXE 검사 39979087663은 모달 설정 창을 닫은 직후 CloseMainWindow 반환값을 무시해 재시작 단계에서 대기 시간 초과가 났다. 부모 창이 다시 활성화됐는지와 실제 닫기 요청 성공 여부를 기다린 뒤 종료를 검사한다. 제품 검증을 생략하지 않고 같은 EXE의 재시작·토글·QR·화면 캡처까지 다시 실행한다.
- 같은 실행의 Android instrumentation 1개는 QR/TLS/모델/오디오와 320dp·font1.3 UI를 모두 통과했다. 이후 adb pull은 Gradle이 테스트 앱을 정리한 뒤 앱 전용 외부 경로에서 PNG를 찾지 못해 실패했다. 테스트 안에서 민감한 연결 화면이 아닌 대시보드 캡처만 전용 공용 시험 경로로 먼저 복사하고, 종료 후 그 파일을 수집한다. release 앱에 저장소 권한이나 shell 실행 코드를 추가하지 않는다.

## 검증과 다음 조치

로컬 .NET Core/Network 검사, Windows/Fixture 교차 빌드, Android testDebugUnitTest/lintDebug/assembleDebug/assembleDebugAndroidTest를 통과했다. 신규 문자열 리소스 경고를 수정했다. AndroidX 테스트 의존성의 기존 새 버전 안내 2개는 오류가 아니다.

공통 QR fixture의 HTTP/공개 IP/자격 증명·추가/중복 필드·버전/지문/유효 시간 거부, 기존 등록의 허용 기본값, TLS pin/replay, 서버 사용 금지 우회 거부, 기기 일시 중지/재개와 해제를 검사한다. 실제 Windows UI/QR 픽셀, Android 320dp·font scale 1.3의 메뉴·재접속·목록/토글·등록 확인 검사는 Actions에서 수행하며 결과·실제 공개 파일 검증은 작업 보고서에 기록한다. 물리 카메라로 화면의 QR을 읽는 품질은 별도 실기기 항목이다.
