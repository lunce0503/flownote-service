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
