# Codex 로그인 계정의 WebRTC 음성

## 요청과 수정

- 사용자: API 키 대신 Codex CLI에 로그인한 계정으로 보이스 세션 사용.
- 영향: `flownote-remote` CLI, 미디어 worker·검증·패키징·CLI/제품/릴리스 소유 문서. 웹/클라우드 서비스 변경은 없다.
- 0.4.0의 API 키 오류는 `thread/realtime/start`의 WebSocket 경로를 선택한 결과였다. 같은 Codex CLI 0.164.0 로그인에서 `transport: {type: webrtc, sdp}`를 쓰면 계정 음성 연결에 성공한다. 이전 기록을 당시 버전에 한정하고 정정 링크를 남겼다.
- `account/read`로 ChatGPT 계정을 확인하고 Codex가 인증·토큰 갱신·호출 생성을 관리한다. Flownote는 auth.json/계정 토큰을 읽거나 복사하지 않는다. Codex 음성 자식에게 API 키 환경 변수를 전달하지 않고 API 키 계정은 캡처 전에 거부한다. 미디어 worker에는 API 키·계정 자격 증명을 전달하지 않는다. 사용자 로그인/설정을 자동 변경하지 않는다.
- Node/Playwright Chromium worker가 AudioWorklet PCM24k mono ↔ WebRTC/Opus를 연결한다. Codex의 SDP 응답을 전달하고 backend 시작과 실제 미디어 연결을 모두 확인한 뒤 캡처한다. 원격 실패·Ctrl+C·EOF는 캡처/프로세스를 정리한다. 입력 큐 2초 제한과 실시간 pacing, 로컬 재생 끼어들기, canonical/legacy 전사 중복 방지를 적용했다.
- 기본 `voice`와 SSH PCM은 계정 WebRTC를 사용한다. 기존 `--native`/제한 미디어 MCP도 같은 계정을 확인하며 유지한다. 앱 마이크 전달/앱 대화형 비서 역량은 별도 범위다.

## 검증

- .NET CLI Release 빌드: 경고/오류 0.
- 오프라인 실제 프로세스 검사: ChatGPT 계정 확인, 미로그인/API 키 계정 거부, API 키 환경 상속/대체 차단, SDP 중계, PCM·전사 분리/중복 방지, 승인/관리 동작 거부, 원격 오류/종료·유휴 입력 중 실패 취소·잘못된 입력 거부 통과.
- `node tests/webrtc-audio-checks.mjs`: Chromium 양단의 AudioWorklet → WebRTC/Opus → 24kHz mono PCM. 18개 청크 중 8개에 실제 신호 확인. API 키/계정 없이 로컬 미디어 경로를 검증하며 실제 계정 검증과 구분한다.
- 실제 계정: `tests/live-account-voice-check.py --run`. 현재 Codex 0.164.0 ChatGPT 로그인으로 backend/SDP/미디어 연결, 짧은 요청에 대한 음성 응답과 assistant 전사를 확인했다. API 키 환경에 의도적으로 유효하지 않은 테스트 표식을 넣어도 키를 전달/사용하지 않고 성공했다. exit=0, PCM 수신 230,400 bytes, non-silent 14 chunks, peak RMS 0.07124, 전사=true, 오류 없음. 음성 원본과 계정 식별자/토큰을 파일로 저장하지 않았다.
- Chromium 원격 stream은 활성 volume=0 audio element로 디코더를 가동해야 WebAudio PCM이 무음이 되지 않는다. 해당 실패/수정은 [버그 기록](../bugs/2026-10-24-remote-cli-voice-auth.md)에 남겼다.
- Node/Chromium/OS 의존성이 필요하다. 물리 마이크/스피커 및 원거리 SSH/VPN 지연은 별도 장치 수용 항목이다. 실제 계정 검사를 CI fixture 성공으로 대신하지 않는다. opt-in 실제 검사 스크립트는 CI에서 실행하지 않으며 사용자 자격 증명을 CI에 추가하지 않았다.

## 릴리스와 배포

- 버전 0.4.1 / Android versionCode 6. 기존 Windows 단일 EXE, 동일 키 Android APK, Linux x64 CLI tar.gz와 체크섬 정책을 유지한다. worker와 관련 라이선스를 Linux 아카이브에 포함한다.
- 최종 소스·두 저장소 CI·추출 패키지·공개 파일 결과는 완료 후 아래에 기록한다.
- Vercel/Railway 실행 target이나 변경 산출물이 없어 cloud 배포는 생략한다. 향후 웹/API 변경이 생기면 `node scripts/deploy-cloud.mjs release <target>`으로 staging-first 검증/배포한다. 네이티브 앱의 같은 소스 수용 검사 후 GitHub 태그 릴리스를 진행한다.
- 현재 계약: [CLI 안내](../../flownote-remote/docs/CLI.md), [제품 명세](../../docs/product-specs/gesture-remote-app.md). 공식 근거는 [OpenAI App Server](https://learn.chatgpt.com/docs/app-server)와 설치 CLI의 실험적 JSON schema이며, 미디어 규약은 [WebRTC 안내](https://developers.openai.com/api/docs/guides/voice-webrtc)를 참고했다. 계정 자격 증명을 API 예제 코드로 대체하지 않는다.
