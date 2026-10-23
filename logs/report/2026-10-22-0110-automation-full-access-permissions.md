# Codex 자동화 실행 권한 통일

## 요청과 적용

사용자가 자동화 에이전트의 `sandbox_mode="danger-full-access"`, `approval_policy="never"` 설정을 명시 요청했다. 영향 범위는 `automation/codex/`의 공통 runner와 메일 notifier이며 앱 소스·배포 정책·타이머·cloud 권한은 바꾸지 않았다. 기본 `~/.codex/config.toml`의 두 키는 이미 같은 값이어서 비밀값을 출력하지 않고 확인만 했다.

- 공통 runner의 6종 작업(weekly-review, ci-fix, staging-triage, feedback-triage, feedback-implement, feedback-release-review)에 두 config 값을 명시했다.
- 기존 task별 `PERMISSION_BASE`, `default_permissions`, `permissions.flownote-automation`, `/codex-home` deny 설정을 제거했다. 혼용된 권한 설정이 제한을 보장하는 것처럼 보이지 않도록 했다.
- 메일 notifier에도 같은 값을 명시하고 workspace/자동 승인 검토를 선택할 수 있는 `--approve-for-me`를 제거했다. Gmail 도구 설정과 수신자는 유지한다.
- runner metadata에 두 설정을 함께 기록한다. 모델 `gpt-6.1-sol`, 기본 provider/로그인 방식, plugin/app/MCP 차단과 credential 환경 변수 제거는 유지한다.
- 설치된 `~/.local/bin/flownote-codex-run`, `flownote-codex-notify`가 수정한 저장소 파일의 symlink임을 확인했다. 실행 중인 관련 모델 작업은 없으며 다음 실행부터 즉시 적용된다. unit 변경이 없어 daemon-reload/재시작은 필요하지 않다. 이전 실행 결과를 새 권한으로 수행한 것처럼 갱신하지 않았다.

## 남아 있는 경계와 승인한 위험

OpenAI Docs의 sandbox/approval 설명을 확인한 뒤 설정을 단일 체계로 정리했다. 보안 검토 스킬은 Codex 권한과 Docker 마운트/업무 정책을 구분하는 데 적용했고 TDD 스킬은 실제 인자에 대한 회귀 검증에 적용했다.

- Codex 자체 파일·네트워크 sandbox와 승인 검토는 없다. 마운트된 로그인 캐시의 읽기·변조를 차단한다고 설명하지 않는다.
- 기존 Docker root read-only, 리뷰/분석 소스 ro와 구현/CI 소스 rw 마운트, 임시 디렉터리와 자원 제한은 유지한다. 기존 SYS_ADMIN 및 seccomp/AppArmor 해제도 바꾸지 않았고 강한 호스트 격리를 보장하지 않는다. host runtime은 Docker 경계도 없다.
- 비배포/비변경 프롬프트의 역할은 유지하지만 이는 Codex sandbox가 아니다. 배포 전 변경 허용 목록·크기/테스트 조건·독립 리뷰·최대 2회 보정·원본 지문 검사·staging E2E·동일 소스 운영 배포는 그대로다.
- dependency 설치는 기존 별도 network 허용 컨테이너, 앱 build/test는 credential 없는 network=none 컨테이너를 유지한다.
- 메일은 기존 Gmail send 도구 및 고정 수신자 지시를 유지한다. 수신자 제한이 클라우드 IAM 수준의 강제라고 설명하지 않는다.

공식 근거: [Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security), [Permissions](https://learn.chatgpt.com/docs/permissions).

## 검증

- 새 기대값을 먼저 테스트에 추가한 첫 실행: 8 통과/6 실패. 공통 runner/알림이 명시적인 두 설정을 전달하지 않는 것을 확인했다.
- 수정 후 `bash automation/codex/tests/run-tests.sh`: 14/14 통과. 6종 전체의 실제 Codex 인자, 알림의 두 인자와 `--approve-for-me` 부재, 컨테이너 리뷰 소스 ro 유지, provider/model 유지, 환경 변수 제거, 실패 시 배포 성공으로 기록하지 않음을 확인했다. 가짜 CLI이므로 실제 모델/API/Gmail 호출이 아니다.
- `node --test automation/codex/tests/feedback-release.test.mjs`: 32/32 통과. 기존 배포/보정 정책 유지.
- `bash -n` runner/notifier/tests 및 해당 변경의 `git diff --check`: 통과.
- TOML의 기본 설정 두 키와 설치 symlink read-back 통과. feedback/weekly timer는 계속 active/waiting이고 새 feedback 수집은 2026-10-23T00:00:05Z 예정이다.
- 소유 문서 `docs/operations/codex-automation.md`, `docs/product-specs/user-feedback-automation.md`, 실행 README의 오래된 sandbox 보장 설명을 정정했다.

## 배포 범위

이 변경은 서버에서 직접 실행하는 Bash 인자와 문서이며 Vercel/Railway 앱 실행 산출물이 없다. 설치 symlink로 서버 자동화에 적용했다. Dockerfile 변경이 없어 이미지 빌드는 하지 않았다. 앱 build/staging E2E/production 재배포는 수행하지 않았다. 특히 기존 작업 트리에 다수의 별도 앱 변경이 있어 이번 권한 요청에 섞어 배포하지 않는다. 기존 사용자 변경·피드백 원본·DB·수집 cursor를 되돌리거나 삭제하지 않았다.

별도 앱 릴리스가 필요하면 해당 소스 범위를 먼저 검토한 뒤 `node scripts/deploy-cloud.mjs release web` 또는 실제 영향 서비스 release를 사용한다. 현재 자동화 설정 적용에 그 추가 배포는 필요하지 않다.

변경 결과 메일은 새 full-access/never 옵션의 기존 notifier로 지정 수신자에게 1건 발송했다. `~/.local/state/flownote-codex/runs/20261022T011000Z-full-access-permissions/email-final.json`의 `sent=true`, 수신자 일치와 message ID `1a1612a5dca5749a`를 확인했다. 실제 발송 외에 별도의 구현 모델 실행이나 피드백 재처리는 시작하지 않았다.
