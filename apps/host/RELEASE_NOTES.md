# Flownote Remote Host 0.1.0

Linux 데스크톱에서 Flownote 원격 터미널 클라이언트를 수신하는 초기 MVP 릴리스입니다.

## 포함 기능

- TLS 기반 WebSocket 원격 터미널 호스트
- 일회성 등록 토큰과 SHA-256 인증서 지문 확인
- 단일 클라이언트 및 단일 PTY 세션 제한
- 연결 해제 후 5분간 세션 유지와 최대 1 MiB 출력 재생
- 터미널 크기 변경, 상태 확인, 기기 토큰 폐기
- 일반 사용자 권한으로 설치하는 Linux 설치기

## 설치

```sh
curl --proto '=https' --tlsv1.2 -fsSL \
  https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.1.0/install-remote-host.sh \
  -o install-remote-host.sh
sh install-remote-host.sh --version 0.1.0
```

Node.js 20 이상, npm, OpenSSL, curl, tar, sha256sum과 `node-pty` 빌드 환경이 필요합니다.

이 호스트는 실행한 OS 사용자의 전체 셸 권한을 원격 클라이언트에 부여합니다. 신뢰할 수 있는 LAN 또는 기존 VPN에서만 사용하고 포트를 공용 인터넷에 직접 노출하지 마세요.

Android 클라이언트와 APK는 이 릴리스에 포함되지 않습니다.
