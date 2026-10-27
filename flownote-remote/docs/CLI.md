# Linux 서버와 Codex 음성 CLI

0.6.0에서는 서버가 휴대폰 터치 입력을 Windows 출력 클라이언트로 전달합니다. `gestures on`은 중지 안내와 함께 거부하며, 서버는 항상 제스처 OFF를 유지합니다. Linux CLI 서버 자체에는 데스크톱 마우스를 주입하지 않습니다. Windows 클라이언트에서 마우스 제어를 허용한 뒤 휴대폰에서 대상을 선택하세요. 기존 0.5.x 제스처 활성 예제 대신 [터치 입력](TOUCH.md)을 사용합니다.


0.4.0부터 `flownote-remote` CLI를 제공한다. Linux x64 서버가 기존 Android/Windows 입출력 클라이언트와 같은 HTTPS/WSS v1 규약을 사용한다. 기존 웹/API의 cloud 정책과 별개다. Linux GUI·카메라 캡처 앱은 포함하지 않는다. 음성은 CLI의 별도 Codex 세션이며 Android/Windows 앱의 마이크를 전달하는 기능은 아직 없다.

## 설치와 서버

공개 릴리스의 `Flownote-Remote-0.5.2-linux-x64.tar.gz`를 내려받아 체크섬을 확인하고 압축을 푼다. .NET 런타임은 포함한다. 0.5.0 골격 서버는 Node/Chromium 없이 실행한다. 음성 세션에만 Node.js 24와 Playwright Chromium/시스템 라이브러리가 필요하다. 사용자 계정으로 실행한다.

```bash
tar -xzf Flownote-Remote-0.5.2-linux-x64.tar.gz
cd Flownote-Remote-0.5.2-linux-x64
./flownote-remote server --listen 192.168.0.10
```

서버 PC에 설정된 실제 사설/VPN IPv4를 지정한다. 기본 포트는 17843, 주소를 생략하면 loopback만 사용한다. `0.0.0.0`, 공개 IP/도메인, HTTP는 거부한다. 방화벽·VPN·포트 전달은 자동 변경하지 않는다. 클라이언트가 카메라에서 골격을 추출하고 서버는 관절 데이터만 판정한다. 원본 영상을 받지 않는다. 제스처는 재시작할 때마다 OFF다.

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

`--no-vision`과 `--vision-root`는 이전 스크립트 호환용으로만 받아들이며 0.5.0 서버의 골격 기능을 끄거나 서버 모델을 켜지 않는다. 소스에서는 `dotnet run --project src/Flownote.Remote.Cli -- server --listen <IP>`로 실행한다. 음성은 빌드 로그가 PCM에 섞이지 않도록 빌드된 실행 파일로 실행한다. 범주별 동작·후면 카메라·관절 데이터 계약은 [GESTURES.md](GESTURES.md)를 따른다. `tasks`로 실제 등록 작업을 조회한다.

## 상태·관리와 systemd

기본 상태는 Linux의 `$XDG_DATA_HOME/flownote-remote` 또는 `~/.local/share/flownote-remote`다. `--data-dir`로 서버와 모든 관리 명령에 같은 경로를 지정할 수 있다. 디렉터리 0700, 인증서 개인키 PFX·등록 토큰 해시·설정·소유자 소켓은 0600으로 저장한다. Linux 사용자 권한으로 보호하며 Windows DPAPI와 다른 저장 방식이다. 심볼릭 링크나 그룹/타인에게 열린 상태 파일은 거부한다. 원본 토큰은 서버에 저장하지 않는다.

같은 계정의 로컬 Unix 소켓으로만 관리한다. 관리용 HTTP API는 만들지 않는다. 다른 컴퓨터에서는 `ssh server '/경로/flownote-remote devices'`처럼 SSH를 사용한다. 중복 서버는 상태 잠금을 획득하지 못하며 실행 중 소켓을 교체하지 않는다. SIGINT/SIGTERM은 연결을 닫고 소켓을 제거한다. 인증서/등록을 보존해 서버 재시작 후 기존 클라이언트가 재접속할 수 있다. 서버 주소가 바뀌거나 인증서가 만료되면 새 상태 디렉터리와 재등록이 필요하다.

`packaging/flownote-remote.service`는 사용자 systemd 템플릿이다. 설치 경로와 IP를 실제 값으로 편집하고 `~/.config/systemd/user/`에 복사한 뒤 `systemctl --user daemon-reload`, `systemctl --user enable --now flownote-remote`로 실행한다. 본 CLI는 사용자 서버를 자동 설치/활성화하지 않는다. 서버 실행과 초대 명령이 같은 데이터 경로를 사용해야 한다.

## 로그인된 Codex 계정의 음성 세션 (0.4.1+)

Codex CLI 0.164.0의 ChatGPT 로그인 상태를 그대로 사용한다. 이미 로그인했다면 다시 로그인할 필요가 없다. 로그인하지 않은 경우에만 공식 기기 코드 흐름을 사용한다.

```bash
codex login --device-auth  # 미로그인일 때만
# 음성용 Chromium 설치 (서버만 쓸 때는 불필요). OS 의존성 설치에는 관리자 권한 필요.
node node_modules/playwright/cli.js install --with-deps chromium
./flownote-remote doctor
./flownote-remote voice --workspace /작업/폴더
# 같은 사용자의 Flownote 서버 조회/미디어 제어도 연결할 때
./flownote-remote voice --remote-tools --workspace /작업/폴더
```

기본 `voice`는 `codex app-server --listen stdio://`를 자식 프로세스로 실행한다. `account/read`에서 ChatGPT 계정인지 확인하고 `thread/realtime/start`에 **WebRTC SDP**를 전달한다. 로그인·계정 토큰 갱신과 호출 인증은 Codex가 담당한다. Flownote는 auth.json/토큰을 읽거나 복사하지 않는다. API 키가 shell 환경에 있어도 음성 Codex 자식 프로세스에 전달하지 않으며 API 키 계정이면 실행 전에 명시적으로 거부한다. 미디어 worker에도 계정/API 인증 정보를 전달하지 않는다. 기존 로그인·사용자 설정을 자동 변경하지 않는다.

오디오 미디어는 포함된 Playwright 코드와 별도 설치된 Chromium의 WebRTC/Opus로 전달한다. Web Audio AudioWorklet이 PCM16LE 24kHz mono와 연결하며 브라우저 자체 마이크를 자동 캡처하지 않는다. ALSA `arecord`/`aplay` 또는 명시적 stdin/stdout만 사용한다. Node.js 24와 포함된 Playwright 버전의 Chromium/OS 의존성 설치가 음성에도 필요하다. `arecord -L`, `aplay -L`로 장치 이름을 확인하고 `--input-device`, `--output-device`로 고른다. ALSA 명령은 `alsa-utils` 패키지다.

Codex 세션 시작과 실제 WebRTC 연결이 **모두** 완료된 뒤 마이크를 연다. 인증 거부·ICE 실패·연결 종료·Ctrl+C·EOF에는 캡처와 미디어 프로세스를 정리한다. 실제 미디어 연결 전에는 연결 성공을 표시하지 않는다. 입력 버퍼는 최대 2초로 제한하고 파일/파이프 입력도 실시간 속도로 보낸다. 로컬 ALSA 재생은 말 끼어들기 이벤트 때 중단한다. 외부 PCM 플레이어의 버퍼는 그 소비자가 관리한다.

0.4.0의 `realtime conversation requires API key auth` 오류는 **기존 WebSocket 음성 경로의 선택** 때문이었다. 로그인 계정 음성 전체가 API 키를 필요로 한다는 뜻이 아니다. 0.4.1에서 WebRTC로 수정했으며 현재 실제 로그인 계정으로 세션 연결과 무음이 아닌 음성 응답 수신을 검증했다. 음성 사용 가능 여부/한도는 해당 계정·워크스페이스 정책을 따른다. 오류가 나도 API 인증으로 자동 전환하지 않는다.

```bash
./flownote-remote voice --thread <기존-Codex-대화-UUID>
# 시작할 때 짧은 문장을 전달하는 선택적 입력
./flownote-remote voice --message '음성 연결을 확인해줘.'
```

`--remote-tools`는 같은 사용자의 서버 소켓에서 `devices`, `volume-up`, `volume-down`, `mute`, `unmute`만 허용한다. 관리·초대·임의 명령은 이 도구에 없다. 직접 브리지에서 도구는 새 대화에 등록한다. 지원하지 않는 승인 요청을 거부하며 기본 Codex 작업 공간은 read-only다. Android/Windows 앱의 마이크 전송이나 `conversationalAssistant` 역량은 아직 추가하지 않는다. 음성/전사는 로그인한 계정의 Codex 서비스에 전달되며 Flownote는 이를 파일로 녹음하지 않는다. Codex 자체 대화 기록 정책은 별도로 적용된다.

0.5.0부터 실제 WebRTC 음성 연결이 완료된 세션은 같은 사용자·같은 `--data-dir`의 실행 중 서버 작업 목록에 자동 등록한다. 세션 종료 시 제거하고 비정상 종료는 갱신 만료로 정리한다. `--native` 내부 세션과 다른 PC의 Windows 서버는 자동 등록 대상이 아니다. 상세 범위는 [GESTURES.md](GESTURES.md)를 따른다.

## 마이크 없는 Linux 서버와 SSH

로컬 Linux 컴퓨터의 음성을 SSH 표준 입출력으로 전달할 수 있다. 서버에는 ALSA가 없어도 되지만 Node/Chromium과 로그인된 Codex CLI는 필요하다. SSH 서버 키 검증을 정상 유지한다.

```bash
arecord -q -t raw -f S16_LE -r 24000 -c 1 |
  ssh -T user@server '/설치/경로/flownote-remote voice --pcm-stdio --workspace /작업/폴더' |
  aplay -q -t raw -f S16_LE -r 24000 -c 1
```

형식은 PCM16 little-endian, 24kHz, mono다. 일반 로그·전사는 stderr, stdout은 오디오 전용이므로 `2>&1`을 붙이지 않는다. 헤드셋을 사용하면 재생음의 재입력을 줄일 수 있다. 물리 마이크/스피커·원거리 SSH 지연은 별도 장치 검증이 필요하다.

소스 실행은 `dotnet build src/Flownote.Remote.Cli -c Release` 후 빌드된 실행 파일에 `voice --voice-root "$PWD"`를 전달한다. 빌드 로그가 PCM에 섞이지 않게 `dotnet run`으로 오디오 파이프를 열지 않는다. 패키지에는 worker가 포함되어 `--voice-root`를 생략한다. `--node PATH`는 별도 위치의 Node 실행 파일을 지정한다.

## Codex 자체 터미널 음성

```bash
./flownote-remote voice --native --remote-tools --workspace /작업/폴더
# Codex 터미널에서 /voice, /voice mute, /voice stop
```

`--native`는 같은 계정 확인 후 Codex 자체 TUI와 음성 장치를 사용한다. `--remote-tools`는 이번 실행에만 Flownote 미디어 MCP를 연결하고 사용자 설정 파일은 수정하지 않는다. 인터랙티브 터미널이 필요하다. SSH TTY는 마이크를 전달하지 않으므로 이 방식은 실행된 컴퓨터의 음성 장치를 사용한다. 위의 SSH PCM 브리지와 구분한다.

## 검증과 배포

```bash
dotnet build src/Flownote.Remote.Cli -c Release
dotnet run --project tests/Flownote.Remote.Cli.Checks -c Release -- --vision
python3 tests/cli-voice-checks.py
node tests/webrtc-audio-checks.mjs
bash scripts/package-linux.sh
```

CLI 서버 검사는 실제 TLS/WSS 등록·소유자 소켓 권한·중복 실행·제스처·출력 시험 어댑터·재시작/자격 유지·해제·SIGTERM을 검증한다. 음성 fixture 검사는 ChatGPT 계정 확인·API 키 전달/대체 차단·SDP 중계·PCM 파이프·stderr 전사·위험 요청 거부·오류/종료를 검증한다. Chromium 양단 검사에서는 실제 AudioWorklet/WebRTC/Opus/PCM 송수신을 확인한다. 실제 계정 세션/음성 응답은 별도로 수동 검증하며 CI fixture로 대체하지 않는다. Linux CI에서 추출한 정확한 배포 실행 파일도 검사한다. Windows 배포는 계속 단일 EXE, Android는 기존 키의 서명 APK이며 Linux CLI tar.gz와 함께 체크섬에 포함한다. 이 CLI에는 Vercel/Railway 배포 target이 없다.

공식 규약: [OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server), [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference). 실험적 음성 필드는 로컬 `codex app-server generate-json-schema --experimental` 결과가 기준이다.
