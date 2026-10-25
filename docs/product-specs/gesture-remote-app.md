# 카메라 제스처 원격 앱

소유 코드: [`flownote-remote/`](../../flownote-remote/README.md). 기존 웹 설치 앱과 원격 터미널과 별개이며 Windows PC/Linux CLI 서버와 Android/Windows 입출력 클라이언트를 제공한다. 상세 사용자 흐름·메시지 계약·보안·현재 기능의 단일 소유 문서는 [네트워크 명세](../../flownote-remote/docs/NETWORK.md)다.

## 역할과 현재 범위

2026-10-23 사용자 요구로 이 네이티브 원격 앱에 한해 PC 서버와 사설/VPN HTTPS/WSS 직접 통신을 사용한다. 기존 Flownote 웹·API의 cloud 전용 정책은 유지한다. 클라이언트는 카메라·음원·UI·화면·프로젝터 입출력을 담당하고, 서버는 제스처 판정·음원 처리·화면 배치·비서 작업을 관리한다.

0.3.0은 기존 TLS 등록·실제 카메라/MediaPipe 제스처·OS 볼륨/음소거·상태 음성 알림에 기능 카드 대시보드, 클라이언트 사용 토글/이름/기능 요약, `⋯` 세부 메뉴와 QR 연결을 추가한다. 화면·접근성·연결 흐름은 [UX 명세](../../flownote-remote/docs/UX.md)가 소유한다. 음원 전송·분리/합성, 화면/프로젝터 출력, 대화형 AI는 후속이며 역량을 false로 표시한다. 위험 알림은 실제 상태 규칙과 OS TTS다.

## 사용자 흐름과 경계

1. Windows 대시보드에서 서버를 시작한다. 사설/VPN IPv4는 `⋯ → 서버 연결 설정`에서 선택한다. PC의 카메라/스피커도 같은 인증 프로토콜의 클라이언트로 연결한다.
2. 서버의 **클라이언트 연결**에서 QR을 표시한다. 클라이언트가 읽거나 연결 코드를 붙여넣으면 주소·지문을 채우고 사용자 확인 후 2분·일회용 코드로 등록한다. 직접 입력도 유지한다. 기기 토큰은 Windows DPAPI / Android Keystore로 보호하고 서버에는 검증 해시만 저장한다.
3. 서버는 제스처 제어 대상과 음성 알림 대상 기기를 고른다. 등록된 클라이언트는 그룹의 제한된 미디어 명령만 실행할 수 있다. 셸·임의 URL·프로세스 실행은 없다.
4. 카메라는 사용자가 시작할 때 권한을 요청한다. 명시적 중지·연결 종료·창 닫기, Android 백그라운드 전환에 수집을 중지한다. 0.5.0부터 원본 영상은 기기 안에서만 분석하고 골격만 서버로 전송한다.
5. 서버 제스처 명령은 기본 OFF다. 기존 설정의 최소 신뢰도 80%, 유지 400ms, 재실행 1200ms를 적용한다. 같은 손 모양을 유지하면 한 번만 실행한다. 네트워크 관찰 간격은 최대 750ms이며 손실/저신뢰도/설정 변경 시 필터를 초기화한다.
6. 클라이언트 행에서 사용 토글·기기 이름·연결 기능을 확인한다. 서버는 기기 사용 허용을 저장하고 클라이언트는 자기 참여만 일시 중지한다. 중지 중 카메라/출력 명령을 차단하고 상태는 유지한다. 다른 기기의 관리·등록 해제·대상 지정은 기기 `⋯` 메뉴에서 수행한다.

공유 설정 v1은 [`config/default-settings.json`](../../flownote-remote/config/default-settings.json)이 소유한다. 기존 합성 입력 검사는 실제 장치 명령과 분리한다. 이전 Thumb_Up/Down/Closed_Fist/Victory 매핑은 로컬 진단 호환용이다. 실제 명령은 [범주별 골격 제스처 명세](../../flownote-remote/docs/GESTURES.md)를 따른다. 기존 Sound Manager DSP는 고정 커밋의 MIT 코어이며 실제 음원 입출력 경로와 EQ는 아직 연결 전이다.

## 검증과 배포

- .NET Core/Network 검사: 설정·규칙, 실제 TLS/WSS 인증·코드 재사용 거부·출력 응답·상태 알림·등록 해제.
- Windows 검사: 실제 WebView2/MediaPipe 모델과 OS TTS WAV 합성. 패키징된 EXE 하나로 시작·라이선스·설정 복원·모델 및 TLS 서버 시작 검사. 출력 시험 어댑터 검사는 물리 스피커 검증과 구별한다.
- Android: 단위/lint/build, 동일 release 키 서명 검증, Android 10 에뮬레이터에서 APK 실행 및 Camera2·실제 모델·AudioManager 음량·배터리/연결 알림 검사.

독립 저장소 `lunce0503/flownote-remote-service`의 태그 기반 시험 릴리스는 항상 Windows 단일 EXE와 서명 APK, 체크섬을 배포하며 0.4.0부터 Linux x64 CLI tar.gz도 포함한다. WebView2 Runtime은 Windows에 필요하며 .NET·모델·라이선스는 EXE에 포함한다. 절차는 [릴리스 문서](../../flownote-remote/docs/RELEASING.md)를 따른다. 물리 카메라·스피커·Bluetooth·원거리 VPN 지연은 별도 실기기 수용 항목이다.

이 PC 앱에는 Vercel/Railway 실행 산출물이나 배포 target이 없다. 웹 다운로드 페이지/클라우드 API를 바꿀 때만 `node scripts/deploy-cloud.mjs release <target>`으로 staging 검증 후 production에 반영한다.

## 2026-10-24 Linux CLI와 Codex 음성

사용자 요구로 Linux x64 서버를 추가했다. 동일 사설/VPN HTTPS/WSS 인증·카메라/제스처·미디어 제어 규약을 재사용하며 서버 관리만 소유자 전용 Unix 소켓으로 제공한다. 서버 재시작 시 제스처는 OFF다. Linux 상태 디렉터리는 0700, 인증서/등록 해시/설정/소켓은 0600으로 보호하며 Windows/Android 저장 방식과 구분한다.

CLI의 Codex 네이티브 TUI 실행과 실험적 실시간 PCM 음성 브리지는 별도 기능이다. 0.4.0의 Codex 0.164.0 계정 실측에서 기존 WebSocket 음성 시작은 API-key 인증 필요로 거부됐다. 오프라인 PCM 검증과 실제 음성 통화 성공을 구분한다. 앱 마이크 전송·대화형 AI 역량은 아직 false다. 설치·systemd·SSH·정확한 인증 제한과 검증은 [CLI 소유 문서](../../flownote-remote/docs/CLI.md)를 따른다. Linux CLI tar.gz를 릴리스에 추가하며 Windows는 계속 단일 EXE, Android는 기존 키의 APK다. Vercel/Railway 실행 target은 없다.

### 0.4.1 계정 음성 정정

기본 CLI `voice`를 WebRTC로 변경해 Codex CLI의 기존 ChatGPT 로그인을 사용한다. API 키를 요구하거나 API 키 인증으로 대체하지 않는다. Codex가 계정 인증/토큰 갱신을 담당하고 미디어 worker에는 자격 증명을 전달하지 않는다. 실제 계정 세션 시작·WebRTC 연결·음성 응답 수신을 확인했다. 기존 API 키 오류는 0.4.0에서 선택한 WebSocket 경로의 제약이었으며 계정 음성 전체의 제약이 아니다. ALSA/SSH PCM, 계정 확인, 시작/종료·검증 기준은 [CLI 문서](../../flownote-remote/docs/CLI.md)를 따른다. 앱 마이크 전송과 물리 장치 검증 범위는 별도로 유지한다.

## 0.5.0 범주별 제스처와 골격 전송

사용자 요구로 전체(연결된 모든 앱/출력), 중간 관리(실행 작업 선택), 세밀 조정(키보드 기본·명시적 핀치)의 11개 동작을 추가한다. 카메라 후면/장치 선택을 저장하고 선택 장치 부재 시 자동 대체하지 않는다. 클라이언트의 손 21점/자세 33점 추출과 뼈대 표시 후 관절만 WSS로 전송하며 서버의 원본 JPEG 업로드 경로를 차단한다. Windows 서버와 Linux CLI 서버는 카메라 모델 없이 시작한다. 서버/클라이언트를 함께 업데이트해야 한다.

현재 화면 조작은 Flownote Remote 앱 창과 작업 패널에 한정한다. Android 최소화는 기존 백그라운드 수집 중지 정책에 따라 연결도 끊으므로 사용자가 재실행한다. 실제 Linux Codex 계정 음성 세션을 같은 사용자 서버에 등록하며 선택/상세 보기를 지원한다. 에이전트 프로세스 실행·종료나 다른 앱의 창 제어를 포함하지 않는다. 동작·수치 제한·데이터·검증 범위는 [GESTURES.md](../../flownote-remote/docs/GESTURES.md)가 소유한다.
