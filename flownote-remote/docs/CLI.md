# Linux 서버와 Codex 음성 CLI

0.4.0부터 `flownote-remote` CLI를 제공한다. Linux x64 서버가 기존 Android/Windows 입출력 클라이언트와 같은 HTTPS/WSS v1 규약을 사용한다. 기존 웹/API의 cloud 정책과 별개다. Linux GUI·카메라 캡처 앱은 포함하지 않는다. 음성은 CLI의 별도 Codex 세션이며 Android/Windows 앱의 마이크를 전달하는 기능은 아직 없다.

## 설치와 서버

공개 릴리스의 `Flownote-Remote-0.4.0-linux-x64.tar.gz`를 내려받아 체크섬을 확인하고 압축을 푼다. .NET 런타임은 포함한다. 기본 서버는 별도로 설치된 Node.js 24와 Playwright Chromium/시스템 라이브러리를 사용한다. 사용자 계정으로 실행한다.

```bash
tar -xzf Flownote-Remote-0.4.0-linux-x64.tar.gz
cd Flownote-Remote-0.4.0-linux-x64
# 포함된 Playwright 버전의 Chromium과 OS 의존성을 설치한다. OS 패키지 설치에는 관리자 권한이 필요하다.
node node_modules/playwright/cli.js install --with-deps chromium
./flownote-remote server --listen 192.168.0.10
```

서버 PC에 설정된 실제 사설/VPN IPv4를 지정한다. 기본 포트는 17843, 주소를 생략하면 loopback만 사용한다. `0.0.0.0`, 공개 IP/도메인, HTTP는 거부한다. 방화벽·VPN·포트 전달은 자동 변경하지 않는다. 카메라 영상은 Chromium 내 로컬 MediaPipe로 처리하며 외부 AI에 전송하지 않는다. 모델·Node·Chromium 오류는 서버 시작을 실패시킨다. 제스처는 재시작할 때마다 OFF다.

별도 터미널에서 같은 설치 폴더의 실행 파일로 관리한다.

```bash
./flownote-remote invite       # 2분·일회용 연결 링크. 앱의 연결 코드 붙여넣기에 사용
./flownote-remote devices      # UUID, 연결/허용/출력/카메라 상태
./flownote-remote gestures on
./flownote-remote target <기기-UUID>
./flownote-remote voice-target <기기-UUID>
./flownote-remote volume-up <기기-UUID>
./flownote-remote mute <기기-UUID>
./flownote-remote pause <기기-UUID>
./flownote-remote allow <기기-UUID>
./flownote-remote revoke <기기-UUID>
```

링크에는 주소·인증서 지문·단기 코드만 넣고 장기 토큰은 넣지 않는다. 신뢰하는 기기에만 전달한다. 서버 기본 로그에는 연결 코드를 출력하지 않는다. `invite`를 실행하면 기존 초대는 무효화된다. `QUEUED`는 전달 요청이며 적용 완료를 뜻하지 않는다. 실제 결과는 `devices`의 상태로 확인한다. Linux 서버 자체는 출력 클라이언트로 등록하지 않고 연결된 Android/Windows 기기의 출력 장치를 사용한다.

모델 없이 미디어/기기 관리만 필요하면 `server --listen <IP> --no-vision`을 쓴다. 이 모드에는 Node/Chromium이 필요 없고 카메라/인식 역량을 false로 알리며 제스처 켜기를 거부한다. 소스에서 실행하려면 `npm ci --ignore-scripts`, `node scripts/prepare-vision.mjs`, Chromium 설치 후 `dotnet run --project src/Flownote.Remote.Cli -- server --listen <IP> --vision-root "$PWD"`로 실행한다. 소스 모드의 출력 뒤에 붙는 빌드 로그를 PCM 파이프에 섞지 않도록 음성은 빌드된 실행 파일로 실행한다.

## 상태·관리와 systemd

기본 상태는 Linux의 `$XDG_DATA_HOME/flownote-remote` 또는 `~/.local/share/flownote-remote`다. `--data-dir`로 서버와 모든 관리 명령에 같은 경로를 지정할 수 있다. 디렉터리 0700, 인증서 개인키 PFX·등록 토큰 해시·설정·소유자 소켓은 0600으로 저장한다. Linux 사용자 권한으로 보호하며 Windows DPAPI와 다른 저장 방식이다. 심볼릭 링크나 그룹/타인에게 열린 상태 파일은 거부한다. 원본 토큰은 서버에 저장하지 않는다.

같은 계정의 로컬 Unix 소켓으로만 관리한다. 관리용 HTTP API는 만들지 않는다. 다른 컴퓨터에서는 `ssh server '/경로/flownote-remote devices'`처럼 SSH를 사용한다. 중복 서버는 상태 잠금을 획득하지 못하며 실행 중 소켓을 교체하지 않는다. SIGINT/SIGTERM은 연결을 닫고 소켓을 제거한다. 인증서/등록을 보존해 서버 재시작 후 기존 클라이언트가 재접속할 수 있다. 서버 주소가 바뀌거나 인증서가 만료되면 새 상태 디렉터리와 재등록이 필요하다.

`packaging/flownote-remote.service`는 사용자 systemd 템플릿이다. 설치 경로와 IP를 실제 값으로 편집하고 `~/.config/systemd/user/`에 복사한 뒤 `systemctl --user daemon-reload`, `systemctl --user enable --now flownote-remote`로 실행한다. 본 CLI는 사용자 서버를 자동 설치/활성화하지 않는다. 서버 실행과 초대 명령이 같은 데이터 경로를 사용해야 한다.

## Codex 네이티브 음성

Codex CLI를 설치·로그인한 터미널에서:

```bash
codex login --device-auth
./flownote-remote doctor
./flownote-remote voice --native --workspace /작업/폴더
# 같은 계정의 서버를 음성으로 조회/미디어 제어할 때 MCP 도구를 명시적으로 연결
./flownote-remote voice --native --remote-tools --workspace /작업/폴더
# 열린 Codex 터미널에서 /voice, /voice mute, /voice stop 사용
```

`--native`는 Codex 자체 TUI와 음성 장치를 사용하며 보이스 자동 시작이나 마이크 권한을 우회하지 않는다. 기본 read-only 작업 공간과 승인 불가 정책을 전달하고 기존 Codex 설정을 수정하지 않는다. `--remote-tools`는 이번 실행에만 `flownote-remote mcp` stdio 서버를 연결해 제한된 미디어 도구를 제공한다. 지원 버전/플랫폼·계정의 음성 사용 권한이 필요하다. `--thread <UUID>`로 기존 대화를 열 수 있다. SSH TTY는 마이크를 전달하지 않으므로 원격 컴퓨터에서 이 명령을 실행하면 그 컴퓨터의 장치만 사용한다.

## CLI 음성 브리지와 headless 서버

`voice`의 기본 브리지는 `codex app-server --listen stdio://`를 자식 프로세스로 실행하고 실험적 `thread/realtime/*`를 사용한다. 설치된 Codex가 생성하는 JSON schema에서 메서드/형식을 확인하고 `initialize` → `thread/start` 또는 `thread/resume` → `thread/realtime/start`를 보낸다. 시작 완료 이벤트 후에만 캡처하며 닫힘/오류/Ctrl+C/EOF에 캡처와 자식 프로세스를 정리한다. 일반 로그와 전사는 stderr, `--pcm-stdio`의 stdout은 오디오 전용이다.

**실제 Codex 0.164.0 / 현재 계정 검증:** 로그인과 schema/RPC는 성공했지만 WebSocket 음성 시작은 `realtime conversation requires API key auth`로 거부됐다. ChatGPT 로그인만으로 브리지가 동작한다고 보장하지 않는다. 지원되는 API-key 인증과 음성 모델 권한이 있는 Codex 환경에서 사용해야 한다. API 키를 Flownote 옵션·문서·초대·로그에 넣지 않는다. 기존 로그인을 자동 변경하지 않으며 Codex의 공식 인증 방식으로 별도 구성한다. 음성/전사는 사용자가 선택한 Codex 제공자에 전달되며 Flownote는 이를 파일로 녹음하지 않는다. Codex의 자체 대화 기록 정책은 별도로 적용된다.

Linux 장치에서는 `alsa-utils`의 `arecord`/`aplay`를 사용한다. `arecord -L`, `aplay -L`로 장치 이름을 찾는다.

```bash
./flownote-remote voice --workspace /작업/폴더 --input-device default --output-device default
./flownote-remote voice --thread <Codex-대화-UUID>
# 명시한 경우에만 기기 조회/볼륨/음소거 도구를 새 Codex 대화에 연결한다.
./flownote-remote voice --remote-tools
```

`--remote-tools`는 같은 사용자의 서버 소켓에서 `devices`, `volume-up`, `volume-down`, `mute`, `unmute`만 허용한다. 기기 등록/권한 변경/초대/임의 셸 명령은 이 도구에 포함하지 않는다. 기존 대화에 도구를 소급 추가하지 않는다. 지원되지 않는 Codex 승인/도구 요청은 거부하고 대기 상태로 남기지 않는다. 앱의 `conversationalAssistant` 역량은 아직 false다. CLI 보이스 연결을 앱 내 음성 비서 연결 완료로 표시하지 않는다.

마이크 없는 Linux 서버에서 실행하려면 로컬 Linux 컴퓨터의 음성을 SSH 표준 입출력으로 전달한다. SSH 서버 키 검증은 정상 설정을 유지한다.

```bash
arecord -q -t raw -f S16_LE -r 24000 -c 1 |
  ssh -T user@server '/설치/경로/flownote-remote voice --pcm-stdio --workspace /작업/폴더' |
  aplay -q -t raw -f S16_LE -r 24000 -c 1
```

형식은 **PCM16 little-endian, 24kHz, mono**다. `--pcm-stdio`는 ALSA 설치를 요구하지 않는다. 자막/진단이 오디오에 섞이지 않게 `2>&1`을 붙이지 않는다. 지연·계정 제한·물리 마이크/스피커·에코 제거는 실제 장치에서 별도 확인한다. 스피커 소리가 재입력되지 않도록 헤드셋을 권장한다. 네이티브 TUI와 PCM 브리지 옵션을 섞으면 거부한다.

## 검증과 배포

```bash
dotnet build src/Flownote.Remote.Cli -c Release
dotnet run --project tests/Flownote.Remote.Cli.Checks -c Release -- --vision
python3 tests/cli-voice-checks.py
bash scripts/package-linux.sh
```

CLI 서버 검사는 실제 TLS/WSS 등록·소유자 소켓 권한·중복 실행·제스처·출력 시험 어댑터·재시작/자격 유지·해제·SIGTERM을 검증한다. 음성 fixture 검사는 PCM 바이트 보존, stderr 전사, 위험 요청 거부, 백엔드 거부/종료와 잘못된 PCM을 검증하며 **실제 계정 음성 통화 성공을 대체하지 않는다**. Linux CI에서 추출한 정확한 배포 실행 파일도 검사한다. Windows 배포는 계속 단일 EXE, Android는 기존 키의 서명 APK이며 Linux CLI tar.gz와 함께 체크섬에 포함한다. 이 CLI에는 Vercel/Railway 배포 target이 없다.

공식 규약: [OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server), [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference). 실험적 음성 필드는 로컬 `codex app-server generate-json-schema --experimental` 결과가 기준이다.
