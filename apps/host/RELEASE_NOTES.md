# Flownote Remote Host 0.4.0

Linux와 Windows 데스크톱에서 Flownote 원격 터미널 클라이언트를 수신하는 Host Agent 릴리스입니다.

모바일 IDE: Android 0.3.0의 파일 탐색·읽기·편집·저장을 위한 인증된 HTTPS API를 추가했습니다. Host 설정 cwd를 루트로 사용하며 256 KiB 이하 UTF-8 일반 파일만 지원하고 symlink/경로 이탈/일반 비밀 파일을 거부합니다. revision 충돌 시 409로 거부하며 임시 파일을 통한 원자적 교체와 기존 mode를 유지합니다. 기존 인증서·기기 토큰·QR·WSS 터미널은 유지합니다.

새 기능: `remote-host pair --name "Work PC"`의 QR 등록, 선택적 `--qr-file PATH` PNG 저장, 5분 유효·1회용 코드와 TLS 등록 API. Android 0.2.0 이상에서 스캔·지문 확인 후 신규 기기 토큰을 발급받습니다. 기존 설정과 기기 토큰은 유지합니다.

## 포함 기능

- TLS 기반 WebSocket 원격 터미널 호스트
- 일회성 등록 토큰과 SHA-256 인증서 지문 확인
- 단일 클라이언트 및 단일 PTY 세션 제한
- 연결 해제 후 5분간 세션 유지와 최대 1 MiB 출력 재생
- 터미널 크기 변경, 상태 확인, 기기 토큰 폐기
- 일반 사용자 권한으로 설치하는 Linux 셸 및 Windows PowerShell 설치기
- Windows PowerShell PTY, 사용자 설정 ACL과 로컬 Named Pipe 제어 채널
- Linux와 Windows GitHub Actions 통합 검증

## 설치

Linux:

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.4.0/install-remote-host.sh \
  -o install-remote-host.sh
sh install-remote-host.sh --version 0.4.0
```

Windows PowerShell:

```powershell
Invoke-WebRequest https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.4.0/install-remote-host.ps1 -OutFile .\install-remote-host.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-remote-host.ps1 -Version 0.4.0
```

Node.js 20 이상과 npm이 필요합니다. `node-pty` 사전 빌드 바이너리를 사용할 수 없는 환경에는 네이티브 빌드 도구도 필요합니다.

이 호스트는 실행한 OS 사용자의 전체 셸 권한을 원격 클라이언트에 부여합니다. 신뢰할 수 있는 LAN 또는 기존 VPN에서만 사용하고 포트를 공용 인터넷에 직접 노출하지 마세요.

Android 클라이언트와 APK는 이 릴리스에 포함되지 않습니다.
