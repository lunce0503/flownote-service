# Codex 자동화 틀 구현 결과

## 범위

- Bash 기반 `codex exec` 실행기와 큐 디스패처
- 읽기 전용 주간 리뷰, CI 수정 후보, staging 장애 분석 작업
- systemd user service, timer, path watcher
- 자동화 전용 bare clone과 실행별 detached worktree
- JSON Schema 결과, JSONL trace, Git 상태와 binary patch 보존
- 설치·운영·중지·복구 문서와 격리 테스트

## 안전 경계

- 현재 개발 작업 트리를 자동화 입력으로 사용하지 않는다.
- `danger-full-access`와 승인·sandbox 우회를 사용하지 않는다.
- 자동 commit, push, PR 생성, cloud 설정 변경과 배포를 하지 않는다.
- CI와 배포 로그는 신뢰할 수 없는 데이터로 취급한다.
- 실행과 큐 소비는 각각 파일 잠금으로 단일화한다.
- 인증값은 저장소와 systemd unit에 기록하지 않는다.
- 기본 사용자 설정은 `--ignore-user-config`로 제외하고 `factchat.config.toml` profile만 명시적으로 사용한다.
- 모든 자동 실행은 CLI `--model gpt-6-sol`로 모델을 고정하고 실행 메타데이터에도 기록한다.
- FactChat provider key 외의 cloud credential 환경 변수를 runner와 unit에서 제거한다.
- shell environment policy로 model 하위 프로세스에서 key·secret·token 환경 변수를 제외한다.

## 검증 계획

- `automation/codex/tests/run-tests.sh`
- `bash -n automation/codex/bin/* automation/codex/install.sh automation/codex/tests/run-tests.sh`
- `systemd-analyze --user verify automation/codex/systemd/*`
- JSON Schema 파싱 확인
- `automation/codex/install.sh --dry-run --no-clone`

## 검증 결과

- 격리 Bash 테스트: `8 passed, 0 failed`
- Bash 구문 검사: 통과
- 결과 JSON Schema 파싱: 통과
- systemd unit 검증: 통과
- 설치 dry-run: 통과, 파일 변경 없음
- 실제 installer: bare automation clone, 실행기 symlink, user unit 설치 성공
- worktree smoke: `origin/main` detached worktree 생성·정리 성공
- timer/path 상태: 설치 후 `disabled`, `inactive` 확인
- FactChat profile: `--profile factchat` 전달, profile·model catalog 존재, 현재 systemd user manager 세션에 provider key 존재 확인
- 모델 고정: profile 기본값과 관계없이 `--model gpt-6-sol` 전달 및 `metadata.txt` 기록 확인
- 서버 호환성 확인: Codex CLI를 `0.155.1`에서 `0.160.0`으로 갱신하고 `factchat.config.toml` + `--model gpt-6-sol` 구성 파싱 통과
- provider 제한: 현재 FactChat catalog에는 `gpt-6-astra`만 있어 gateway의 `gpt-6-sol` 허용 여부는 첫 수동 API 실행에서 확인 필요
- 보안 점검: 외부 로그를 데이터로만 취급하고, 기본 사용자 config 격리, FactChat 외 cloud credential 제거, 하위 셸의 secret 환경 제외를 확인

실제 Codex API 호출, systemd timer/path 활성화, staging/production 배포는 수행하지 않는다. 자동화 틀 자체는 Railway/Vercel 런타임 산출물이 아니며, 활성화는 첫 수동 결과를 검토한 뒤 운영자가 결정한다.
