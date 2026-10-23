# 카메라 제스처 원격 앱

소유 코드: [`flownote-remote/`](../../flownote-remote/README.md). 기존 웹 설치 앱과 원격 터미널과 별개이며 Windows PC 서버와 Android/Windows 입출력 클라이언트를 제공한다. 상세 사용자 흐름·메시지 계약·보안·현재 기능의 단일 소유 문서는 [네트워크 명세](../../flownote-remote/docs/NETWORK.md)다.

## 역할과 현재 범위

2026-10-23 사용자 요구로 이 네이티브 원격 앱에 한해 PC 서버와 사설/VPN HTTPS/WSS 직접 통신을 사용한다. 기존 Flownote 웹·API의 cloud 전용 정책은 유지한다. 클라이언트는 카메라·음원·UI·화면·프로젝터 입출력을 담당하고, 서버는 제스처 판정·음원 처리·화면 배치·비서 작업을 관리한다.

0.2.0은 TLS 기기 등록·해제, 실제 카메라 JPEG 전송, 서버 MediaPipe 손 모양 인식, 클라이언트 OS 볼륨/음소거 제어, heartbeat와 배터리·메모리·장치/연결 오류 음성 알림을 연결한다. 음원 전송·분리/합성, 화면 합성/프로젝터 출력, 대화형 AI 제공자는 후속이다. 해당 역량은 프로토콜에서 false로 표시한다. 위험 알림은 실제 상태 규칙과 OS TTS를 사용한다.

## 사용자 흐름과 경계

1. Windows의 서버·클라이언트 연결 화면에서 PC 사설 IPv4를 선택해 서버를 시작한다. 서버 PC의 카메라/스피커도 같은 인증 프로토콜의 클라이언트로 연결한다.
2. 클라이언트에서 주소·인증서 SHA-256 지문을 직접 대조하고 2분·일회용 코드로 등록한다. 기기별 토큰은 Windows DPAPI / Android Keystore로 보호하며 서버에는 검증 해시만 저장한다. 서버에서 등록을 해제할 수 있다.
3. 서버는 제스처 제어 대상과 음성 알림 대상 기기를 고른다. 등록된 클라이언트는 그룹의 제한된 미디어 명령만 실행할 수 있다. 셸·임의 URL·프로세스 실행은 없다.
4. 카메라는 사용자가 시작할 때 권한을 요청한다. 명시적 중지·연결 종료·창 닫기, Android 백그라운드 전환에 수집을 중지한다. 원본 영상을 영구 저장하지 않는다.
5. 서버 제스처 명령은 기본 OFF다. 기존 설정의 최소 신뢰도 80%, 유지 400ms, 재실행 1200ms를 적용한다. 같은 손 모양을 유지하면 한 번만 실행한다. 네트워크 관찰 간격은 최대 750ms이며 손실/저신뢰도/설정 변경 시 필터를 초기화한다.

공유 설정 v1은 [`config/default-settings.json`](../../flownote-remote/config/default-settings.json)이 소유한다. 기존 합성 입력 검사는 실제 장치 명령과 분리한다. Thumb_Up/Down은 음량, Closed_Fist는 음소거다. Victory의 대화형 비서는 미연결 안내만 제공한다. 기존 Sound Manager DSP는 고정 커밋의 MIT 코어이며 실제 음원 입출력 경로와 EQ는 아직 연결 전이다.

## 검증과 배포

- .NET Core/Network 검사: 설정·규칙, 실제 TLS/WSS 인증·코드 재사용 거부·출력 응답·상태 알림·등록 해제.
- Windows 검사: 실제 WebView2/MediaPipe 모델과 OS TTS WAV 합성. 패키징된 EXE 하나로 시작·라이선스·설정 복원·모델 및 TLS 서버 시작 검사. 출력 시험 어댑터 검사는 물리 스피커 검증과 구별한다.
- Android: 단위/lint/build, 동일 release 키 서명 검증, Android 10 에뮬레이터에서 APK 실행 및 Camera2·실제 모델·AudioManager 음량·배터리/연결 알림 검사.

독립 저장소 `lunce0503/flownote-remote-service`의 태그 기반 시험 릴리스는 항상 Windows 단일 EXE와 서명 APK, 체크섬만 배포한다. WebView2 Runtime은 Windows에 필요하며 .NET·모델·라이선스는 EXE에 포함한다. 절차는 [릴리스 문서](../../flownote-remote/docs/RELEASING.md)를 따른다. 물리 카메라·스피커·Bluetooth·원거리 VPN 지연은 별도 실기기 수용 항목이다.

이 PC 앱에는 Vercel/Railway 실행 산출물이나 배포 target이 없다. 웹 다운로드 페이지/클라우드 API를 바꿀 때만 `node scripts/deploy-cloud.mjs release <target>`으로 staging 검증 후 production에 반영한다.
