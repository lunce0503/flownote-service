# Flownote Remote Host

`remote-host`는 Android 원격 터미널 클라이언트가 사용자의 Linux 또는 Windows PC에 WSS로 연결해 실제 PTY 셸을 조작하게 하는 Host Agent다. 이 프로그램은 Flownote 클라우드나 인터넷 릴레이를 거치지 않는다.

## 보안 경계

연결된 클라이언트는 `remote-host`를 실행한 OS 사용자의 전체 셸 권한을 가진다. 신뢰하는 LAN 또는 이미 구성된 VPN에서만 사용하고, 공유기 포트 포워딩으로 `7443`을 인터넷에 직접 공개하지 않는다.

- 자체 서명 TLS 인증서와 SHA-256 지문을 생성한다.
- 기기 토큰 원문은 초기화할 때 한 번만 표시하고 PC에는 scrypt 해시만 저장한다.
- 인증 전에는 PTY를 생성하지 않는다.
- 동시에 쓰기 가능한 클라이언트와 PTY는 각각 하나다.
- 단절된 세션은 5분 동안만 메모리에 보존한다.
- 메시지는 64KiB, 입력은 16KiB, 출력 재생은 1MiB로 제한한다.
- 토큰, 터미널 입출력과 명령어는 로그에 기록하지 않는다.

## 지원 범위

- Linux x64/arm64, Windows 10/11 x64
- Node.js 20 이상, npm과 지원 셸 필요
- `node-pty` 설치에 사전 빌드 바이너리가 없으면 Python 3, `make`, C++ 컴파일러 필요
- Android 앱은 별도 릴리즈다. Host 0.3.0은 앱 0.2.0 이상의 QR 등록을 지원한다. 인터넷 릴레이와 systemd 상주 서비스는 포함하지 않는다.

## Linux 설치

GitHub Release의 설치기를 확인한 뒤 실행한다.

```bash
curl --proto '=https' --tlsv1.2 -fL \
  https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.3.0/install-remote-host.sh \
  -o /tmp/install-remote-host.sh
less /tmp/install-remote-host.sh
sh /tmp/install-remote-host.sh
```

기본 설치 위치는 `~/.local/lib/flownote-remote-host/<version>`이고 실행 링크는 `~/.local/bin/remote-host`다. PATH에 `~/.local/bin`이 없으면 셸 설정에 추가한다.

## Windows 설치

PowerShell에서 설치기를 내려받아 내용을 확인한 뒤 실행한다. 관리자 권한은 필요하지 않다.

```powershell
Invoke-WebRequest `
  https://github.com/lunce0503/flownote-service/releases/download/remote-host-v0.3.0/install-remote-host.ps1 `
  -OutFile .\install-remote-host.ps1
notepad .\install-remote-host.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-remote-host.ps1
```

기본 설치 위치는 `%LOCALAPPDATA%\Flownote\RemoteHost`다. 설치기는 `bin` 경로를 사용자 PATH에 추가하므로 새 PowerShell 또는 명령 프롬프트에서 `remote-host`를 실행한다.

## 초기화와 실행

PC의 실제 LAN/VPN 주소를 `--host`와 `--bind`에 명시해야 인증서 SAN과 접속 주소가 일치한다.

```bash
remote-host doctor
remote-host init --host 192.168.0.10 --bind 192.168.0.10 --device phone-01
remote-host serve
```

`init`이 출력하는 다음 값을 Android 클라이언트에 등록한다.

- WSS 주소: `wss://<host>:7443/v1/connect`
- `deviceId`
- 기기 토큰
- 인증서 SHA-256 지문

지문은 PC 화면과 휴대폰 화면에서 별도로 대조한다. 인증서가 바뀌면 자동으로 신뢰하지 말고 재등록한다.

## 관리

Host가 실행 중일 때 5분 유효·1회용 등록 QR을 생성한다. 앱에서 스캔한 후 PC 지문과 일치함을 확인한다. 새 QR을 생성하면 이전 코드는 무효화된다. 기존 기기 토큰은 바뀌지 않는다.

```bash
remote-host pair --name "Work PC"
remote-host pair --name "Work PC" --qr-file /private/path/pc-pairing.png
```

`--qr-file`은 새 PNG 파일만 생성하고 기존 파일은 덮어쓰지 않는다. Linux는 0600, Windows는 현재 사용자/SYSTEM만 접근하는 ACL을 적용한 뒤 QR 내용을 쓴다. `--json`으로 같은 등록 데이터를 받을 수 있다. QR에 영구 기기 토큰은 넣지 않으며 서버 메모리의 코드는 사용/만료/재시작 시 무효화된다. 새 기기는 TLS `POST /v1/pair`를 통해 발급되고 기존 사용자 전용 설정 파일에 해시로 저장된다. [계약](../../protocol/remote-host/pairing.md)을 참조한다.

```bash
remote-host status
remote-host revoke --device phone-01
```

`status`와 `revoke`는 Linux에서 권한 `0600` Unix 소켓, Windows에서 다른 사용자 공개 옵션을 끈 Named Pipe를 사용한다. `revoke`는 실행 중인 기기 연결과 그 기기의 PTY를 즉시 종료한다.

Linux 기본 설정 디렉터리는 `${XDG_CONFIG_HOME:-~/.config}/flownote-remote-host`, Windows는 `%LOCALAPPDATA%\Flownote\RemoteHost`다. 다른 위치는 모든 명령에 `--config PATH`로 지정한다.

## 개발 검증

## 모바일 IDE 파일 API

Host 0.4.0은 Android 0.3.0의 `코드` 탭을 지원한다. 프로젝트 루트는 초기화할 때 지정한 `--cwd`이며 기본값은 초기화한 폴더다. 기존 설정으로 업데이트하면 루트와 인증서/토큰을 유지한다. UTF-8 일반 파일 256 KiB 이하를 탐색·읽기·revision 충돌 보호 저장할 수 있다. 경로 이탈·symlink·hard link·일반 비밀 파일과 생성/삭제는 거부한다. 쓰기는 임시 파일을 sync 후 교체하고 Linux mode와 Windows ACL을 유지한다. 전체 셸 권한 자체를 프로젝트 sandbox로 제한하지는 않는다. [계약](../../protocol/remote-host/workspace.md)을 참고한다.

## 개발 검증

```bash
cd apps/host
npm ci
npm run verify
npm run package:release
```

공유 메시지 계약은 [`../../protocol/remote-host/v1/protocol.schema.json`](../../protocol/remote-host/v1/protocol.schema.json)에 있다.
