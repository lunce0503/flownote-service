# Linux CLI 음성 인증과 실행 검증

## 실제 계정 음성 인증

- 증상: `codex login status`와 0.164.0 schema/RPC는 성공하지만 `thread/realtime/start`의 WebSocket transport에서 `realtime conversation requires API key auth` 이벤트를 받았다. v3 명시 재현도 동일했다. API 키 환경 변수는 없으며 값/인증 파일은 읽거나 기록하지 않았다.
- 원인: 현재 설치 버전/인증 조합의 실험적 headless WebSocket 경로에는 API-key 인증이 필요하다. ChatGPT 로그인 성공을 해당 경로의 음성 사용 가능으로 간주할 수 없다.
- 처리: CLI는 시작 완료 이벤트 전 캡처하지 않고 backend 오류를 실패로 표시한다. API 인증을 자동 변경하지 않는다. `voice --native`로 Codex 자체 TUI를 여는 별도 경로와 선택적 미디어 MCP 도구를 추가하고 account/platform 조건을 안내한다. 네이티브 보이스의 실제 통화까지 검증했다고 표시하지 않는다.
- 검증: 실제 설치 CLI로 인증 거부 재현. 오프라인 fixture로 정상 PCM·오류/종료·전사 분리·유휴 stdin 중 backend 오류 취소·위험 승인/관리 도구 차단 검증. 실제 통화는 지원되는 인증/음성 권한과 장치가 필요하다.

## Linux Chromium 의존성

- 증상: `node scripts/vision-worker.mjs`가 `libatk-1.0.so.0` 등 4개 시스템 라이브러리 부재로 종료했다.
- 처리: 사용 문서와 시작 오류에 Playwright Chromium/OS 의존성 설치 절차를 명시했다. 작업 호스트는 sudo 비밀번호가 필요해 관리자 패키지를 변경하지 않고 임시 디렉터리에 공개 Ubuntu 패키지를 추출해 LD_LIBRARY_PATH로 검증했다. CI는 `npx playwright install --with-deps chromium`을 실행한다.
- 결과: 실제 Thumb_Up 0.746 → TLS/WSS → 제스처 유지/중복 제한 → 출력 시험 어댑터 성공. 기본 임계값은 80%를 유지하고 해당 fixture에서만 70%를 사용했다.

## 패키징

- 첫 `package-linux.sh`는 저장소에 없는 루트 LICENSE 복사로 실패했다. 원본 앱에 임의 라이선스를 부여하지 않고 존재하는 third-party notices·.NET·MediaPipe·Playwright·Sound Manager 원문만 패키징하도록 정정했다.

## 0.4.1 해결: 로그인 계정 WebRTC

기존 오류를 계정 음성 전체의 API 키 요구로 해석한 부분을 정정한다. `account/read`에서 chatgpt 계정을 확인하고 `thread/realtime/start` transport를 webrtc+SDP로 바꾸면 Codex CLI 0.164.0의 같은 로그인으로 세션이 시작된다. 실제 WebRTC 연결/데이터 채널·무음이 아닌 음성 응답 수신에 성공했다. API 키 환경 변수를 자식에 전달하지 않으며 저장된 인증 파일/토큰을 직접 읽지 않는다. API 키 계정·미로그인·백엔드 거부는 캡처 전에 실패시키고 API 전송 경로로 대체하지 않는다.

### Chromium 무음 수신

연결과 RTP 패킷 수신은 성공했지만 WebAudio만 연결했을 때 디코더의 수신 sample duration/energy가 0이고 PCM이 무음이었다. 원격 stream을 volume=0인 활성 HTML audio element에도 연결해 Chromium 디코더를 가동하고 실제 재생은 PCM 소비자에게 맡겼다. 실제 양단 Chromium Opus 검사에서 18개 PCM 청크 중 8개가 유의한 신호로 확인됐다. 이 회귀를 `tests/webrtc-audio-checks.mjs`와 추출 배포 패키지 CI에 추가했다.

### PCM 소비자 정지와 종료

출력 파이프를 읽지 않을 때 Unix Console stdout의 쓰기가 WriteAsync 호출 안에서 동기적으로 막혀 종료가 지연될 수 있었다. 표준출력 쓰기를 별도 작업으로 격리하고 취소 가능한 대기를 사용했다. 테스트의 고정 시작 지연도 실제 연결 완료·4KiB 파이프 채움 확인으로 교체해 타이밍에 따른 거짓 성공을 막고 실패 시 전체 fixture 프로세스 그룹을 정리한다. 수정 후 source와 self-contained 실행 파일 모두 이 강제 backpressure/SIGTERM 검사를 통과했다. 빌드 캐시를 비운 동일 해시의 파일에서도 타이밍 차이가 있었으므로 캐시 문제로 기록하지 않는다.
