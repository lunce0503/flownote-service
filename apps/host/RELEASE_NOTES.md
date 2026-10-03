# Flownote Remote Host 0.2.0

Linux와 Windows 데스크톱에서 Flownote 원격 터미널 클라이언트를 수신하는 Host Agent 릴리스입니다.

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
  https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.2.0/install-remote-host.sh \
  -o install-remote-host.sh
sh install-remote-host.sh --version 0.2.0
```

Windows PowerShell:

```powershell
Invoke-WebRequest https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.2.0/install-remote-host.ps1 -OutFile .\install-remote-host.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-remote-host.ps1 -Version 0.2.0
```

Node.js 20 이상과 npm이 필요합니다. `node-pty` 사전 빌드 바이너리를 사용할 수 없는 환경에는 네이티브 빌드 도구도 필요합니다.

이 호스트는 실행한 OS 사용자의 전체 셸 권한을 원격 클라이언트에 부여합니다. 신뢰할 수 있는 LAN 또는 기존 VPN에서만 사용하고 포트를 공용 인터넷에 직접 노출하지 마세요.

Android 클라이언트와 APK는 이 릴리스에 포함되지 않습니다.
