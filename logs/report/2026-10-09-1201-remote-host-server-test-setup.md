# 서버 Remote Host 시험 환경

사용자가 APK 실험을 위해 현재 서버에 CLI 설치·실행을 요청했다. Flownote 웹/Expo용 로컬 API 서버를 실행한 것이 아니라 별도 Remote Host 제품의 명시적 PC 접속 시험이다.

## 설치와 실행

- 공개 릴리즈 `remote-host-v0.2.0`의 Linux 설치기를 다운로드하고 저장소 설치기와 일치함을 확인했다.
- 설치기는 다운로드한 배포 tar.gz의 SHA-256 검증을 통과했다.
- 설치 위치: `/home/kwon/.local/lib/flownote-remote-host/0.2.0`.
- CLI 링크: `/home/kwon/.local/bin/remote-host`.
- Linux x64, Node.js 25.9.0, `/bin/bash`; 기존 설정을 덮어쓰지 않고 최초 초기화했다.
- 설정: `/home/kwon/.config/flownote-remote-host`, 초기 PTY 작업 디렉터리 `/home/kwon`.
- Tailscale이 Running이고 `100.94.84.10`이 할당되어 있다. 접속 경로 질문에 응답이 없어 기존 VPN을 기본으로 선택했다.
- WSS: `wss://100.94.84.10:7443/v1/connect`.
- 리스너는 `100.94.84.10:7443`에만 바인딩한다. LAN/public/all-interface 리스너는 추가하지 않았다.
- 사용자 transient systemd 서비스: `flownote-remote-host-test.service`, 실행 상태 active/running, 재시작 횟수 0.
- 시험용 서비스이므로 부팅 시 자동 실행을 영구 설정하지 않았다. SSH 명령 세션과 독립적으로 실행한다.

## 등록 정보

앱 PC 이름은 `Kwon server`, deviceId는 `phone-01`이다. 전체 등록 JSON은 `/home/kwon/.config/flownote-remote-host/registration-phone-01.json`에 있다. 원문 토큰은 보고서·채팅·실행 로그에 넣지 않는다. 디렉터리는 0700이고 config, TLS 개인키와 등록 JSON은 0600이다.

서버 인증서 공개 SHA-256 지문:

```text
48:FB:FB:01:92:19:56:40:95:BA:B6:B3:DC:89:05:34:28:3A:B0:87:80:34:A5:FB:0B:2D:99:82:91:F8:25:CF
```

사용자가 본인 셸에서 아래 명령으로 등록 JSON을 확인한 뒤 앱의 Host 등록 JSON 가져오기에 입력한다. 휴대폰에서 서버와 같은 tailnet의 Tailscale VPN을 켜야 한다. 인증서 지문을 별도로 대조한 다음 신뢰 확인란을 선택한다.

```bash
cat ~/.config/flownote-remote-host/registration-phone-01.json
```

## 검증 결과

- `remote-host doctor --json`: platform/node/shell/config 모두 통과.
- 설치한 node-pty로 실제 셸을 실행해 출력 marker와 종료 코드 0을 확인했다. npm 설치 단계의 install-scripts 경고와 실제 PTY 사용 가능 여부를 구분했다.
- 현재 실행 중인 WSS에 서버 인증서를 CA로 설정하고 지문 일치를 대조한 뒤 연결했다. TLS 검증을 비활성화하지 않았다.
- 잘못된 토큰은 HTTP 401로 거부되었다.
- 실제 hello/PTY 생성/명령 입력/출력/명시적 종료가 통과했다.
- 원격 PTY에서 Codex `codex-cli 0.160.1`이 실행 가능하고 FACTCHAT_API_KEY가 설정되어 있음을 값 출력 없이 확인했다. 모델 API 호출이나 유료 Codex 대화는 실행하지 않았다.
- 검증 세션 종료 후 `remote-host status --json`: running=true, activeDeviceId=null, session=null. 휴대폰 접속 대기 상태다.
- `ss`로 VPN 주소의 단일 7443 리스너를 확인했다.
- 실제 휴대폰-to-server 접속과 Android IME 동작은 사용자 확인 대기다. 서버 자체 WSS 시험을 휴대폰 경유 접속 검증으로 표시하지 않는다.

## 관리

```bash
remote-host status
systemctl --user status flownote-remote-host-test.service
systemctl --user stop flownote-remote-host-test.service
```

서비스는 transient 및 collect 모드다. 중단/재부팅 후 필요하면 아래 명령으로 같은 설정을 사용해 다시 실행할 수 있다.

```bash
systemd-run --user --unit=flownote-remote-host-test \
  --description='Flownote Remote Host Android test' --collect \
  --property=Restart=on-failure --property=RestartSec=5 \
  --setenv=PATH=/home/kwon/.local/bin:/usr/local/bin:/usr/bin:/bin \
  --working-directory=/home/kwon \
  /home/kwon/.local/bin/remote-host serve
```

제품 동작·클라우드 소스 변경 없이 설치·운영과 보고서 작성만 수행했다. Railway/Vercel 실행 산출물이 바뀌지 않아 재배포하지 않는다. 보고서는 문서 존재/내용과 git diff를 검증하고 커밋한다. 개인 등록 JSON과 설정/개인키는 저장소 밖에 유지한다.
