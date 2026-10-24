# Linux CLI와 Codex 음성 세션

## 범위

- 요청: `flownote-remote` CLI 버전, Linux 서버 지원, Codex CLI 연결과 보이스 세션.
- 새 소유 코드: `flownote-remote/src/Flownote.Remote.Cli/`. 기존 Core/Network와 HTTPS/WSS v1을 재사용한다. 웹/백엔드 런타임은 변경하지 않는다.
- Linux x64 서버·소유자 전용 관리 소켓·단기 초대·기기 권한/대상/미디어 명령·실제 로컬 MediaPipe·모델 미사용 모드. Linux 상태 0700/파일 0600, 중복 서버 잠금, 인증서/토큰 해시 유지, SIGINT/SIGTERM 정리.
- Codex native TUI 어댑터, 선택적 제한 미디어 MCP 도구, 실험적 app-server PCM 브리지, ALSA 장치와 SSH stdin/stdout 지원. 기본 read-only, 지원하지 않는 승인 요청과 관리자 동작 거부. 기존 사용자 Codex 설정/인증은 수정하지 않는다.
- 제품/네트워크/아키텍처/CLI/릴리스 소유 문서를 함께 갱신. Android/Windows 앱의 대화형 비서 역량은 false를 유지한다. CLI 보이스와 앱 마이크 연동을 혼동하지 않는다.

## 검증

- `.NET 10.0.402` CLI Release 빌드: 경고/오류 0.
- Core/Network 검사: 실제 TLS/WSS·QR·legacy 권한·pin/replay·출력 확인·pause/revoke 통과.
- `dotnet run --project tests/Flownote.Remote.Cli.Checks -c Release -- --vision`: 실제 서버, 소유자 소켓 0600, 중복 프로세스 잠금, 기기 권한/출력 확인, 인증서·등록 유지/재접속·해제·SIGTERM, Chromium/MediaPipe Thumb_Up 0.746와 출력 시험 어댑터 통과. 물리 소리 출력으로 간주하지 않는다.
- `python3 tests/cli-voice-checks.py`: 오프라인 PCM 바이트 일치·stderr 전사·위험 요청 거부·인증 거부/원격 종료/유휴 입력 오류 취소·홀수 PCM 거부·TTY 네이티브 어댑터/MCP 설정·관리 명령 차단 통과. 실제 음성 통화 성공의 대체 검증이 아니다.
- 실제 Codex CLI 0.164.0: 로그인·설치 schema·RPC 성공. WebSocket v3 음성 시작은 `realtime conversation requires API key auth`로 거부. API 키가 없어 현재 계정 음성 송수신 E2E는 미완료다. `voice --native`는 별도 Codex TUI 진입을 제공하며 지원 계정/플랫폼·물리 장치 검증이 필요하다.
- Linux self-contained 패키지와 추출본의 실제 모델/서버·PCM/MCP 검사 통과. 별도 실행 파일로 `gestures off`, `status`, `invite`의 옵션/위치 인자 처리와 미등록 UUID 거부도 확인했다.

## 배포 경계와 남은 조건

- 버전 0.4.0, Android versionCode 5. Windows 단일 EXE 정책과 기존 APK 서명키를 유지하고 Linux CLI tar.gz를 추가한다. 바이너리와 체크섬만 릴리스에 포함한다.
- Node.js 24/Playwright Chromium은 별도 설치이며 .NET은 Linux 패키지에 포함한다. Codex/ALSA는 외부 도구다.
- Linux 물리 마이크/스피커/SSH 음성·원거리 VPN, 지원되는 API 인증/음성 모델 권한에 대한 실통화 검증은 남아 있다. Android/Windows 마이크 전달과 완전한 앱 비서는 범위 밖이다.
- Vercel/Railway 실행 산출물이나 배포 target이 없으므로 cloud 배포는 생략한다. 향후 웹 다운로드 페이지/API를 변경하면 `node scripts/deploy-cloud.mjs release <target>`으로 staging-first 검증/배포한다. 이 네이티브 릴리스는 GitHub Windows/Android/Linux 실제 산출물 검증으로 진행한다.
- 관련 오류/환경 조치는 [버그 기록](../bugs/2026-10-24-remote-cli-voice-auth.md), 사용 계약은 [CLI 문서](../../flownote-remote/docs/CLI.md), 공식 규약은 [OpenAI App Server](https://learn.chatgpt.com/docs/app-server)와 설치 CLI의 생성 schema를 따른다.

## 최종 CI와 공개 배포

- 독립 앱 소스/태그: `bf61c1fc19715933676afab98939e5d9a10733c6` / `v0.4.0`. [main 사전 수용 검사](https://github.com/lunce0503/flownote-remote-service/actions/runs/40061574090): Windows/Android/Linux 전부 성공. [동일 소스 태그 릴리스](https://github.com/lunce0503/flownote-remote-service/actions/runs/40061933598): 세 플랫폼 및 게시 작업 모두 성공.
- 상위 서비스 소스: `e1d6dbca7204e7e5c730210515a3e403b07ef8a0`. [Quality Gates](https://github.com/lunce0503/flownote-service/actions/runs/40061605890) 8개 성공, [네이티브 앱 검사](https://github.com/lunce0503/flownote-service/actions/runs/40061605871) Windows/Android/Linux 3개 성공. 관련 없는 원래 작업 폴더 변경/인덱스를 보존했다.
- [공개 v0.4.0 시험판](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.4.0): draft=false / prerelease=true. 기존 태그·파일을 교체하지 않았다.
- 자산 4개: Windows 단일 EXE 252,827,467 bytes, Android APK 3,521,547 bytes, Linux x64 CLI tar.gz 66,796,553 bytes, SHA256SUMS.txt 309 bytes.
- 공개 파일을 다시 다운로드하여 SHA-256 3개 모두 일치. APK 서명 검증 성공 및 기존 signer SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed` 유지. 실제 APK versionName=0.4.0 / versionCode=5 / minSdk=29 / targetSdk=35 확인.
- 공개 Windows 파일의 MZ/PE/x64 형식 확인. 공개 Linux 아카이브 추출본 `help` 실행 성공, 라이선스 포함 및 개인키/등록/테스트 데이터 제외 확인. APK에도 기기 시험 인증/이미지 자산이 없다.
- 작업 폴더·독립 저장소·상위 서비스 저장소의 추적 앱 파일 117개가 일치함을 확인했다. 이 마지막 보고서 갱신만으로 Docker/cloud/네이티브 빌드를 반복하지 않는다.
