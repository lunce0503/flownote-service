# 서버와 입출력 클라이언트

## 역할과 적용 범위

2026-10-23 사용자 요구에 따라 `flownote-remote`는 Windows PC 서버와 Android/Windows 입출력 클라이언트로 구성한다. **이 앱에 한해** PC 서버 실행과 사설/VPN 네트워크의 직접 HTTPS/WSS 통신을 허용한다. 기존 Flownote 웹·API의 cloud URL 전용 정책이나 배포 방식을 변경하지 않는다. PC의 서버도 카메라·스피커를 사용할 때는 같은 인증 프로토콜의 로컬 클라이언트로 등록된다.

클라이언트는 카메라·음원·조작 UI·화면/스피커/프로젝터 등 입출력을 맡는다. 서버는 입력을 받아 제스처 판정, 음원 처리, 화면 배치, 비서 작업·상태 판단을 수행하고 출력 명령을 클라이언트에 전달한다. 0.5.0부터 클라이언트가 손·자세 뼈대를 추출하고 서버에는 골격만 전송한다. 원본 사진/영상 업로드를 받지 않는다. [범주별 제스처·골격 명세](GESTURES.md)가 동작과 데이터의 소유 문서다.

## Linux CLI 확장 (0.4.0)

Windows PC 서버 외 Linux x64 CLI 서버를 지원한다. 같은 HTTPS/WSS v1 규약을 유지하고 서버 관리만 소유자 전용 Unix 소켓으로 처리한다. 0.5.0 서버는 모델/Node/Chromium 없이 골격을 판정한다. Node/Chromium은 Codex 음성에만 필요하다. 상세 설치·개인키/등록 보관·명령·Codex 음성 인증/검증 제한은 [CLI 명세](CLI.md)가 소유한다. CLI 보이스는 별도 세션이며 기존 앱의 마이크/대화형 AI 역량을 활성화하지 않는다.

## 현재 실행 가능한 앱 범위

- Windows에서 실제 TLS 서버 시작/중지, 2분·1회용 코드와 인증서 지문으로 기기 등록, 기기 등록 해제.
- 기능 카드·클라이언트 토글/이름/기능 요약과 `⋯` 세부 메뉴, QR 카메라 읽기·연결 코드 복사/붙여넣기. 화면과 연결 순서는 [UX 명세](UX.md)를 따른다.
- Android/Windows에서 서버 접속, heartbeat, 기기 목록과 실제 출력 상태 표시, 그룹 내 대상 기기의 음량 증가/감소·음소거/해제.
- Windows 웹캠과 Android Camera2 영상을 클라이언트의 손/자세 모델로 분석하고 뼈대를 표시한다. 서버는 골격의 시간에 따른 움직임으로 전체/중간 관리/세밀 조정 명령을 판정한다.
- 클라이언트의 실제 OS 음량 API 적용 결과를 서버에 돌려준다. 제어 실패를 성공으로 표시하지 않는다.
- 배터리 부족, Windows 컴퓨터 메모리 압박, 출력 장치/영상 분석 오류, 연결 끊김을 화면과 OS TTS 음성으로 알린다. 자연어 LLM 응답을 기다리지 않는다.
- 서버 음성 대상 기기 하나를 선택한다. 연결이 끊어진 클라이언트는 서버 도움 없이 자체 음성 경고를 시도한다. 음성 엔진/출력 장치가 없거나 음소거면 화면 알림을 유지한다. 한국어 음성이 없으면 지원되는 영어 음성으로 대체한다.

아래는 네트워크 역할에 포함되지만 아직 실행 기능이 아니다. 서버의 `state.capabilities`에서 false로 명시한다.

| 후속 기능 | 클라이언트 | 서버 |
| --- | --- | --- |
| 음원 전송·분리/합성 | 재생음/파일 제공, 처리 결과 재생 | 기존 Sound Manager DSP를 연결하고 stem 분리 모델·동기화·재생 버퍼 추가 |
| 화면·프로젝터 | 화면 입력, 디스플레이/프로젝터 출력 | 화면 합성·배치·출력 라우팅 |
| 대화형 AI 비서 | 대화 UI·음성 입출력 | 제공자·도구·권한을 갖춘 대화 및 작업 관리 |

현재 음량 명령은 출력 클라이언트 OS의 미디어 음량/음소거를 제어한다. EQ·음원 합성 출력 스트림이 연결됐다는 뜻은 아니다. 위험 알림의 문장은 실제 상태 규칙의 템플릿이며 대화형 AI가 위험을 추론하는 기능은 아직 없다.

## 사용 흐름

0.3.0의 기본 연결은 서버의 **클라이언트 연결**에서 QR을 표시하고, 클라이언트가 QR을 읽은 뒤 서버 확인을 거쳐 등록하는 방식이다. 수동 주소·지문 입력과 기존 저장된 서버 재연결도 유지한다. 고급 설정/연결 정보는 `⋯` 메뉴에서 연다.

1. Windows 대시보드에서 **이 PC에서 서버 시작**을 누른다. 사용할 사설/VPN IPv4는 `⋯ → 서버 연결 설정`에서 고른다. 서버는 카메라/모델 없이도 시작한다. 이 PC의 카메라 사용에만 WebView2 Runtime이 필요하다.
2. 서버 화면의 HTTPS 주소·인증서 SHA-256 지문·등록 코드를 클라이언트에 입력한다. 주소·지문을 직접 대조한 확인란을 선택해야 연결한다. 코드로 등록한 기기는 그룹의 제한된 미디어 제어 권한을 갖는다. 코드를 신뢰하는 기기에만 전달한다.
3. 서버는 클라이언트 행의 `⋯`에서 제어 대상과 음성 알림 기기를 고른다. 기본은 서버 PC의 로컬 클라이언트다. 다른 클라이언트도 기기 행의 메뉴에서 그룹의 수동 제어 대상을 선택할 수 있다.
4. 카메라를 보낼 기기에서 사용자가 전송 시작을 눌러 권한을 허용한다. Android는 앱이 백그라운드로 가면 카메라와 연결을 중지한다. Windows는 명시적 중지·연결 종료·창 닫기 때 캡처를 중지한다.
5. 서버의 **제스처** 토글은 기본 OFF다. 켜면 현재 설정으로 명령을 허용한다. 신뢰도·유지 시간·재실행 간격은 `⋯ → 제스처 세부 설정`에서 저장한다. 수동 소리/정확한 수치 제어는 카메라가 꺼져도 동작한다. 이전 손 모양 매핑은 로컬 진단용이며 실제 명령은 [새 카탈로그](GESTURES.md)를 따른다.

등록 이후 자격 증명은 Windows DPAPI CurrentUser / Android Keystore AES-GCM으로 저장한다. 저장된 주소·지문이 같으면 새 코드 없이 다시 연결할 수 있다. 서버 주소/인증서가 바뀌면 새 지문을 대조하고 재등록한다. 등록은 최대 8개(서버 PC 입출력 포함)이며 서버 관리자가 등록 해제로 기존 토큰과 활성 연결을 폐기한다.

Windows Firewall은 사용자가 신뢰하는 사설 네트워크에만 허용한다. 앱은 방화벽·공유기 포트를 자동 개방하지 않는다. 공개 IP/도메인·터널·자동 발견은 현재 지원하지 않는다. 다른 네트워크에서는 이미 구성한 사설 VPN 주소를 사용한다.

## 프로토콜 v1

QR/연결 코드는 `flownote-remote://pair?v=1&address=<escaped HTTPS IPv4 root>&pin=<SHA256>&code=<6 digits>&expires=<UTC epoch seconds>`이다. 정확히 5개 필드를 허용하고 중복/알 수 없는 필드·과대 입력·만료·150초보다 먼 유효 기간·HTTP/공개 IP/URL 자격 증명을 거부한다. 서버는 실제 코드의 2분·1회 정책을 별도로 검증한다. QR에는 장기 토큰을 넣지 않고 파싱만으로 네트워크 요청을 하지 않는다.

서버 포트 기본값은 17843이다. HTTPS만 사용하고 HTTP fallback은 없다. 클라이언트는 리다이렉트를 따르지 않는다. 자체 서명 서버 인증서는 SHA-256 전체 DER 지문과 유효 기간을 검사하며 기본 호스트명/SAN 검증도 유지한다.

`POST /v1/pair`: `{ "code": "6자리", "name": "기기 이름" }` → `{ "deviceId": "UUID", "token": "256-bit hex" }`. 코드 2분·1회, IP별 1분 5회 시도 제한. 토큰은 기기별 발급하며 서버에는 SHA-256 검증값만 보관한다. 인증 정보와 코드·영상은 로그에 남기지 않는다.

`WSS /v1/session`: 헤더 `Authorization: Bearer <token>`. 모든 메시지는 JSON text, 최대 262144 bytes다. 임의 셸·파일·프로세스·URL 실행 기능은 없다.

| 방향 | type | 주요 필드/효과 |
| --- | --- | --- |
| 서버 → 클라이언트 | welcome / state | deviceId(최초), state.devices, gestureTarget, voiceTarget, gesturesEnabled, capabilities |
| 클라이언트 → 서버 | heartbeat | health.volume(0–1), muted, batteryPercent(선택 0–100), outputReady, memoryLoadPercent(선택 0–100), speakAlerts, platform(Windows/Android) |
| 클라이언트 → 서버 | device.enabled | enabled(boolean), 발신 기기 자신의 일시 중지/재개만 변경 |
| 클라이언트 → 서버 | command | commandId(UUID), targetId(UUID), action(volume_up / volume_down / mute / unmute) |
| 서버 → 클라이언트 | output.set | command.commandId, volume(절대값), muted, stepIfUnchanged(기본 true; 정밀 입력은 false) |
| 클라이언트 → 서버 | output.result | commandId, result.applied, volume, muted, error(선택) |
| 클라이언트 → 서버 | skeleton.frame | frameId(UUID), frame(schemaVersion/sequence/크기/방향/추출 기준/모드/자세/손 관절), 최대 16KiB |
| 서버 → 클라이언트 | skeleton.result | 같은 frameId, gesture, scope, confidence=0(확률 미제공) |
| 클라이언트 → 서버 | task.select | taskId(실제로 등록된 실행 작업) |
| 클라이언트 → 서버 | control | targetId, command(정확한 음량/확대/위치/초기화 허용 목록) |
| 서버 → 클라이언트 | interface.set | commandId/scope/action/value/x/y/taskId |
| 클라이언트 → 서버 | control.result | commandId, result.applied/zoom/panX/panY/error |
| 클라이언트 → 서버 | camera.stop / bye | 입력 중지 또는 의도적 연결 해제 |
| 서버 → 클라이언트 | alert | alert.id, code, severity(info/warning/critical), message, english, speak |

heartbeat는 3초마다 보낸다. 서버는 12초간 메시지가 없으면 세션을 끊고 다른 기기에 알린다. 클라이언트도 수신 정지/소켓 오류를 감지하면 자체 연결 끊김 경고와 카메라 중지를 수행한다. 끊긴 명령을 자동 재전송하지 않는다. 최근 128개 명령 ID와 절대 출력값으로 중복 적용을 제한한다.

0.3.0의 state.devices에는 오프라인 등록 기기도 포함한다. 추가 필드는 enabled(서버 허용과 기기 참여가 모두 true), allowed(서버 관리자 허용), outputReady, speakAlerts, platform이다. 서버의 allowed는 등록과 함께 암호화 저장하며 기존 등록에는 true를 기본 적용한다. 클라이언트의 참여는 세션별이다. 상태 연결을 유지해도 enabled=false이면 카메라 인식/발신 명령/출력 라우팅을 차단한다. 서버 관리자 권한은 로컬 UI의 SetDeviceAllowedAsync에만 있고 WebSocket에서 다른 기기의 allowed를 변경할 수 없다. capabilities.clientParticipation이 true일 때만 새 토글을 활성화해 이전 서버의 알 수 없는 메시지로 연결을 끊지 않도록 한다.

0.5.0은 capabilities.cameraFrames=false, skeletonFrames/scopedGestures/interfaceControl=true를 알린다. 새 클라이언트는 skeletonFrames를 명시한 서버에만 골격을 보낸다. 서버는 이전 camera.frame과 원본 영상 필드를 거부한다. state에는 tasks/selectedTask/detectionThreshold, device에는 interfaceReady/zoom/panX/panY가 추가된다. 서버의 판정·속도·범주·임계값·관절 계약은 [GESTURES.md](GESTURES.md)를 따른다. 프레임 응답은 실행 성공 표시가 아니며 실제 output.result/control.result의 applied 응답으로 상태를 갱신한다.

배터리 15% 이하 warning/5% 이하 critical, Windows 실제 시스템 메모리 사용량 90% 이상 warning/97% 이상 critical을 사용한다. 각 상태는 회복 여유(배터리 20%, 메모리 80%)와 같은 경고 30초 제한으로 반복 음성을 줄인다. 측정할 수 없는 값은 만들어 보내지 않는다. 서버 분석 오류와 출력 적용 실패도 규칙 기반 알림이다. OS 음소거·음성 엔진 부재·물리 스피커 고장까지 소프트웨어가 음성 전달을 보장하지는 않으므로 화면 알림을 함께 유지한다.

## 검증

- `node scripts/prepare-vision.mjs`: 고정 npm tarball SHA-512, MediaPipe 모델/공개 시험 이미지 SHA-256 검사. 모델은 EXE 안에 넣고 런타임에 외부로 영상을 보내지 않는다.
- `dotnet run --project tests/Flownote.Remote.Network.Checks -c Release`: 실제 TLS/WSS, 잘못된 지문/코드 재사용 거부, 등록/heartbeat/배터리 알림/출력 응답/중복/해제 검사.
- Windows의 `dotnet run --project tests/Flownote.Remote.Windows.Checks -c Release`: 실제 클라이언트 WebView2/손 관절 모델 → 골격 TLS 전송, 합성 몸 자세 → 제스처 규칙 → 출력 시험 어댑터, 알림 전달, 실제 OS TTS WAV 합성 검사. 실제 스피커 볼륨 하드웨어 검증과 구별한다.
- Android 기기 CI: 실제 Camera2 가상 장치 프레임, 고정 지문 TLS/WSS, 실제 Chromium/동일 MediaPipe 모델, Android AudioManager 음량 변화, 배터리 알림과 예상치 못한 연결 종료 검사. 테스트 인증 코드/이미지는 androidTest에만 생성하고 release APK에 포함하지 않는다.

물리 카메라·스피커·Bluetooth·멀리 떨어진 VPN에서의 지연은 별도 실기기 수용 항목이다. WebView2 Runtime이 없는 Windows PC에는 [Microsoft 공식 Runtime](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution)을 설치해야 한다. MediaPipe 동작/API는 [Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)와 [Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) 공식 안내를 따른다.
