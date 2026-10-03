# Remote Host 제품 사양

## 목적과 범위

Remote Host는 사용자가 소유한 Linux 또는 Windows PC에서 실행되고 Android 원격 터미널 클라이언트에 실제 PTY를 제공하는 로컬 Host Agent다. LAN 또는 사용자가 이미 구성한 VPN 안에서 직접 WSS 연결을 사용한다. Flownote 클라우드 중계, NAT 통과, 포트 자동 개방과 Android 앱은 이 릴리즈 범위가 아니다.

원격 클라이언트는 Host 프로세스를 실행한 OS 사용자와 같은 권한을 가진다. 프로젝트 디렉터리에 한정된 파일 접근 도구가 아니라 완전한 원격 셸이므로 인터넷에 직접 공개하지 않는다.

## 코드와 배포 단위

| 경로 | 책임 |
| --- | --- |
| `apps/host/src/cli.ts` | `doctor`, `init`, `serve`, `status`, `revoke` 명령 |
| `apps/host/src/server.ts` | HTTPS/WSS, 인증 제한, 단일 쓰기 연결, 메시지 라우팅, heartbeat |
| `apps/host/src/session.ts` | node-pty 세션, 출력 seq·1MiB 재생 버퍼, 5분 재접속 보존 |
| `apps/host/src/config.ts` | 인증서·토큰 생성, scrypt 검증값, 권한 제한 설정 저장 |
| `apps/host/src/control.ts` | Linux Unix 소켓과 Windows Named Pipe 로컬 제어 채널 |
| `protocol/remote-host/v1/` | Android와 Host가 공유할 JSON Schema와 예제 |
| `apps/host/install.sh`, `install.ps1` | GitHub Release checksum 검증 후 사용자 영역에 설치 |
| `.github/workflows/remote-host.yml` | Linux·Windows 검증과 태그 기반 설치기 릴리즈 |

## 연결과 인증

1. `remote-host init --host <LAN_OR_VPN_IP> --bind <LAN_OR_VPN_IP>`가 RSA 3072 자체 서명 인증서, Host ID와 기기 토큰을 만든다.
2. 토큰 원문은 한 번만 출력하고 설정에는 16바이트 salt와 scrypt 32바이트 검증값만 저장한다.
3. Android 클라이언트는 WSS `Authorization: Bearer` 헤더로 접속하고 사용자가 별도 대조한 SHA-256 인증서 지문을 고정한다.
4. Host는 인증 완료 전에 PTY를 만들지 않으며 1분에 5회 실패한 원격 주소를 1분 동안 제한한다.
5. `revoke`는 새 연결뿐 아니라 현재 연결과 해당 기기의 PTY를 종료한다.

기본 bind는 `127.0.0.1`이다. LAN 접속은 사용자가 주소를 명시해야만 열린다. 메시지 최대 크기는 64KiB, 입력은 UTF-8 16KiB, 터미널 크기는 20~300열과 5~200행이다.

## 세션 수명

- 동시에 WebSocket 쓰기 연결 하나와 PTY 하나만 허용한다.
- 출력에는 증가하는 `seq`를 붙이고 세션당 최근 1MiB를 메모리에 보존한다.
- WebSocket 단절 시 PTY는 5분 후 종료한다. 같은 기기는 `terminal.attach`와 마지막 처리 `seq`로 다시 붙는다.
- 재생 시작점이 버퍼보다 오래되면 `REPLAY_UNAVAILABLE`을 반환하며 완전 복구처럼 표시하지 않는다.
- 입력은 재접속 후 자동 재전송하지 않는다.
- Host 재시작 후 세션 복구와 디스크 출력 보관은 지원하지 않는다.

## 설치와 릴리즈

릴리즈 태그는 `remote-host-v<semver>`다. 설치 자산은 다음 네 파일이다.

- `install-remote-host.sh`
- `install-remote-host.ps1`
- `remote-host-v<version>.tar.gz`
- `remote-host-v<version>.tar.gz.sha256`

설치기는 HTTPS로 아카이브와 checksum을 내려받아 SHA-256과 압축 경로를 확인하고 `npm ci --omit=dev`로 대상 PC의 node-pty를 설치한다. Linux는 `sudo` 없이 `~/.local`, Windows는 관리자 권한 없이 `%LOCALAPPDATA%\Flownote\RemoteHost`를 사용한다.

## 검증 기준

```bash
cd apps/host
npm ci
npm run verify
npm run package:release -- --out=/tmp/remote-host-release
```

GitHub Actions의 Linux와 Windows runner에서 임시 TLS 인증서와 실제 PTY를 사용해 무효 토큰 거부, hello, 생성, 셸 입출력, 단절·reattach, resize와 종료를 검증한다. Windows runner는 PowerShell 설치기의 checksum, 압축 해제, 의존성 설치와 CMD shim도 확인한다. Android 실제 기기와 인증서 pinning, 모바일 키보드·한글 IME 시험은 Android 클라이언트 구현 단계의 남은 수용 조건이다.
