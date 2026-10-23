# Flownote Codex 자동화

이 디렉터리는 Codex CLI `exec`를 Bash와 systemd user service로 실행하는 자동화 틀이다. 모델은 별도의 bare clone/worktree 또는 피드백 snapshot만 수정한다. 피드백 컨트롤러는 검증·배포 후 원본 소스 동일성을 확인한 경우에만 검증된 patch를 개발 작업 트리에 채택한다.

## 제공 작업

| 작업 | Docker 소스 마운트 | 입력 | 결과 |
| --- | --- | --- | --- |
| `weekly-review` | `ro` | 없음 | 구조화된 리뷰 결과 |
| `ci-fix` | `rw` | CI 실패 로그 | 검증 결과와 적용 전 patch |
| `staging-triage` | `ro` | staging 실패 로그 | 원인 분류와 다음 조치 |
| `feedback-triage` | `ro` | 개인정보를 제거한 사용자 피드백 이벤트 | 관련 코드 위치와 검토 항목 |
| `feedback-implement` | `rw` | 사용자 피드백 이벤트 | 별도 snapshot의 구현·회귀 테스트 후보 |
| `feedback-release-review` | `ro` | 구현 후보·실제 검증 결과 | 독립 배포 리뷰 |

2026-10-22 사용자 명시 요청으로 위 6종과 메일 알림은 모두 `--config 'sandbox_mode="danger-full-access"' --config 'approval_policy="never"'`를 사용한다. 기본 config에도 같은 값이 있음을 확인했으며 runner는 이를 명시적으로 고정한다. named permission profile과 알림의 `--approve-for-me`는 제거했다. 표의 ro/rw는 Codex sandbox가 아니라 기존 Docker bind mount 설정이다. host runtime은 이 마운트 경계도 없으므로 서버 사용자 권한으로 실행되며 사용에 주의한다.

모든 저장소 작업은 `--profile`을 지정하지 않고 기본 `~/.codex/config.toml`과 Codex 로그인 캐시를 사용한다. 자동화 모델은 `--model gpt-6.1-sol`로 고정한다. 모델 실행은 commit, push, PR, 배포를 직접 수행하지 않는다. **2026-10-14부터 피드백 서비스는 아래의 별도 신뢰 컨트롤러를 통해 검증된 변경을 자동 배포한다.** 주간 리뷰·CI·staging 분석의 기존 경계는 유지한다.

## 피드백 자동 수정·배포

`FLOWNOTE_AUTOMATION_FEEDBACK_RELEASE=1`인 feedback/dispatch service에서 `flownote-codex-feedback-release`를 호출한다. 기본 명령행 dispatcher는 이 플래그가 없으면 기존 읽기 전용 분석을 유지한다.

1. 현재 개발 소스를 실행별 private Git snapshot으로 복사한다. `.env`, 인증 파일, 업로드, 생성물, symlink는 복사하지 않는다. 기존 사용자 변경은 snapshot의 기준 내용으로 보존한다.
2. 외부 plugin/MCP와 cloud credential이 없는 모델이 앱 소스·회귀 테스트·제품 문서만 수정한다. raw feedback은 저장소 문서에 넣지 않는다.
3. 고정 정책이 변경 파일·크기·테스트 포함 여부를 확인한다. 배포/자동화/설정/의존성 파일, 인증·권한 영역, DB migration, 기존 cloud test 수정, 삭제·rename·symlink는 자동 배포 대상이 아니며 검토 요청으로 중단한다.
4. cloud credential·host home·Docker socket을 mount하지 않은 컨테이너에서 영향받는 앱의 빌드/테스트를 실행하고 별도 read-only 모델이 전체 diff를 리뷰한다. 빌드/린트 오류 또는 명확한 medium/low 기술 문제는 최대 2회 자동 보정하며 매번 정책·전체 검증·전체 diff 리뷰를 다시 수행한다. 고위험/모호한 판단, 검증 중 소스 변조, 보정 한도 초과는 중단한다. 오류 억제 주석이나 테스트 skip으로 검증을 약화할 수 없다.
5. 신뢰된 호스트 스크립트만 `node scripts/deploy-cloud.mjs release feedback-auto`를 실행한다. 변경 대상과 web을 함께 스테이징 배포하고 기존+신규 cloud E2E를 통과한 동일 소스만 production에 배포한다. staging 실패·소스 변경 시 production은 차단된다.
6. 운영 헬스체크 후 기준 소스가 여전히 일치할 때만 후보 patch를 개발 작업 트리에 적용한다. 사용자의 작업 중 변경이 있으면 덮어쓰지 않고 중단한다. 원본 저장소에는 자동 commit/push하지 않는다.
7. 성공·중단 결과와 실제 검증·배포 영수증을 보존하고 지정된 수신자에게 메일을 보낸다. 실패는 `failed/`에 남으며 자동 무한 재시도하지 않는다.

일간 수집 시간과 `gpt-6.1-sol`은 그대로 유지한다. 의도가 불명확하거나 고위험인 요청은 자동으로 제품 결정을 만들지 않는다. production 배포 도중 실패하면 일부 서비스가 이미 변경됐을 수 있으므로 이전 성공 ID와 실패 단계 확인 후 [클라우드 롤백 절차](../../docs/DEPLOYMENT.md)를 따른다. DB rollback이나 임의 서비스 삭제는 자동 실행하지 않는다.

저장소 작업은 모든 plugin/app/MCP를 끈다. Docker에는 소스 snapshot, 결과 디렉터리, 기본 config, 로그인 캐시, config가 참조하는 model catalog만 mount한다. config와 catalog는 read-only이고 로그인 캐시는 토큰 갱신을 위해 파일 단위로 writable하다. 현재 full-access 설정에서는 모델 명령의 `/codex-home` 읽기 차단이나 shell network 차단을 보장하지 않으며 인증 파일 접근·변조 가능성도 있다. 이는 사용자 승인으로 넓힌 권한이며 강한 비밀 격리로 설명하지 않는다. 기존 Docker root read-only, 소스 ro/rw, cloud credential 환경 제거, 별도 검증 컨테이너의 network=none은 유지한다. shell environment policy는 모델이 실행하는 명령에서 `*KEY`, `*SECRET`, `*TOKEN` 환경 변수를 제외한다.

## 설치

먼저 변경 내용을 확인한다.

```bash
automation/codex/install.sh --dry-run
automation/codex/tests/run-tests.sh
docker build --tag flownote-codex-automation:0.160.0 automation/codex/container
```

스크립트, systemd unit, 자동화 전용 clone을 설치한다. 이 명령은 timer와 path watcher를 활성화하지 않는다.

```bash
automation/codex/install.sh
```

다른 원격 저장소를 사용해야 한다면 URL을 명시한다. 토큰이 포함된 URL을 셸 히스토리나 문서에 남기지 않는다.

```bash
automation/codex/install.sh --repository-url <repository-url>
```

설치 위치는 다음과 같다.

```text
~/.local/bin/flownote-codex-run
~/.local/bin/flownote-codex-dispatch
~/.config/systemd/user/flownote-codex*.{service,timer,path}
~/.local/share/flownote-codex/repo
~/.local/state/flownote-codex/
```

## 첫 실행

기본 config와 Codex CLI에 저장된 인증 상태를 확인한 다음 읽기 전용 작업부터 실행한다. 컨테이너 실행은 파일 기반 로그인 캐시 `~/.codex/auth.json`이 필요하다. runner는 FactChat·OpenAI·cloud credential 환경 변수를 명시적으로 제거하고 로그인 캐시만 파일 단위로 mount한다. 저장소 `.env`는 사용하지 않는다.

```bash
codex --version # 현재 고정 실행 정책을 지원하는 CLI 확인
codex login status
test -f ~/.codex/config.toml
test -f ~/.codex/auth.json
systemctl --user start flownote-codex@weekly-review.service
systemctl --user status flownote-codex@weekly-review.service
journalctl --user -u flownote-codex@weekly-review.service --since today
```

결과는 `~/.local/state/flownote-codex/runs/<run-id>/`에 저장된다.

```text
final.json       JSON Schema를 따르는 최종 결과
trace.jsonl      Codex 이벤트 스트림
progress.log     stderr 진행 로그
git-status.txt   변경 파일 목록
change.patch     사람이 검토하고 적용할 후보 patch
metadata.txt     기준 commit과 종료 코드
```

`metadata.txt`에는 `model=gpt-6.1-sol`, `sandbox_mode=danger-full-access`, `approval_policy=never`를 기록한다.

`ci-fix`의 patch를 적용하기 전에 `final.json`, `git-status.txt`, `change.patch`를 모두 검토한다.

## 사용자 피드백 트리거와 메일

`flownote-codex-feedback.timer`는 매일 00:00 UTC(한국 시각 09:00)에 production의 전용 feed를 확인한다. 최대 15초 지연이 있다. 처음에는 현재 cursor만 저장하고 이후 새 피드백을 `feedback-triage-<id>.log` 이름으로 큐에 넣는다. 이름은 기존 큐 호환용이며 서비스의 활성 플래그가 실제 구현·배포 컨트롤러로 분기한다. `user_id`와 `contact`는 feed에 포함되지 않는다.

백엔드와 이 서버는 동일한 무작위 서비스 토큰을 공유한다. 토큰은 저장소나 unit에 쓰지 않고 모드 `0600` 파일과 Railway secret variable로 관리한다.

```bash
install -d -m 700 ~/.config/flownote-codex
umask 077
openssl rand -hex 32 > ~/.config/flownote-codex/feedback-token
# 같은 값을 staging/production flownote-sub의 FEEDBACK_AUTOMATION_TOKEN에 등록한다.
```

분석 결과에 finding, 변경 파일, 또는 `completed`가 아닌 상태가 있으면 별도 알림 실행이 Gmail plugin을 통해 `lunce0503@gmail.com`으로 한 통을 보낸다. 주간 리뷰와 CI·staging·피드백 큐 모두 같은 조건을 사용한다. 알림에는 구조화된 요약과 파일명만 전달하며 원문 피드백, 연락처, 토큰은 포함하지 않는다. 분석 실행에서는 모든 외부 도구를 비활성화한다. 알림 실행은 현재 활성 plugin을 조회해 Gmail 외 plugin을 모두 끄고, Gmail 쓰기 승인만 자동 검토하며 자동 검토가 거부되면 큐를 실패 처리한다.

```bash
systemctl --user enable --now flownote-codex-feedback.timer
systemctl --user start flownote-codex-feedback.service # 최초 cursor bootstrap
journalctl --user -u flownote-codex-feedback.service --since today
```

피드백 수집은 하루 한 번 HTTPS polling으로 실행되므로 다음 수집까지 최대 약 24시간 대기할 수 있고, 이후 분석 시간이 추가된다. 알림 실패 시 해당 큐 항목은 `failed/`에 보존되고 자동 재전송하지 않는다.

## 예약 실행

첫 수동 실행과 기본 config·로그인 캐시 접근을 확인한 뒤 안전한 트리거를 활성화한다. provider API key를 systemd user manager에 import하지 않는다.

```bash
systemctl --user enable --now \
  flownote-codex-weekly.timer \
  flownote-codex-feedback.timer \
  flownote-codex-inbox.path

systemctl --user list-timers 'flownote-codex*'
```

로그아웃 후에도 user timer가 필요하면 관리자가 linger를 활성화한다.

```bash
sudo loginctl enable-linger "$USER"
```

기본 timer는 매주 일요일 03:30 서버 로컬 시각에 `weekly-review`를 실행하고 최대 15분의 무작위 지연을 적용한다.

## 실패 로그 큐

다른 프로세스는 로그를 임시 파일에 완전히 기록한 뒤 `inbox/`로 원자적으로 이동해야 한다.

```bash
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/flownote-codex"
TEMP_FILE="$(mktemp "$STATE_DIR/inbox/.ci-fix-XXXXXX.tmp")"

gh run view <run-id> --log > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_DIR/inbox/ci-fix-<run-id>.log"
```

파일명에 따라 작업이 선택된다.

- `ci-fix-*.log`: 최소 수정과 검증 후 patch 생성
- `staging-triage-*.log`: 읽기 전용 원인 분석
- `feedback-triage-*.log`: 개인정보가 제거된 피드백의 읽기 전용 분석
- 다른 이름: 실행하지 않고 `failed/`로 이동

처리 성공 로그는 `done/`, 실패 로그는 `failed/`에 보존된다. 이 디렉터리는 모드 `0700`, 파일은 `umask 077`로 관리하며 입력에서 토큰·개인정보·원본 업로드 내용을 제거해야 한다. 모델 컨테이너에는 Flownote cloud credential을 주지 않는다. 신뢰 호스트 컨트롤러만 운영자가 이미 인증한 Railway/Vercel CLI를 사용한다.

## 운영 제어

```bash
# 다음 실행 시각 확인
systemctl --user list-timers 'flownote-codex*'

# 신규 큐 소비 중단
systemctl --user disable --now flownote-codex-inbox.path

# 주간 리뷰 중단
systemctl --user disable --now flownote-codex-weekly.timer

# 사용자 피드백 polling 중단
systemctl --user disable --now flownote-codex-feedback.timer

# 현재 작업 로그 확인
journalctl --user -u 'flownote-codex*' --since today
```

같은 서버에서는 runner와 dispatcher가 각각 `flock`을 사용해 중복 실행과 중복 큐 소비를 막는다. 실행 중 원격 `main`이 바뀌어도 해당 실행은 시작 시 만든 detached worktree의 commit을 유지한다.

## 검증

```bash
automation/codex/tests/run-tests.sh
node --test automation/codex/tests/feedback-release.test.mjs
bash -n automation/codex/bin/* automation/codex/install.sh
systemd-analyze --user verify automation/codex/systemd/*
```

테스트는 임시 Git 원격과 가짜 Codex 실행기를 사용하므로 API 호출, cloud 배포, 현재 작업 트리 수정이 발생하지 않는다.

이미지에는 과거 sandbox 실행용 bubblewrap이 남아 있지만 현재 full-access 실행의 접근 차단 근거로 사용하지 않는다. 컨테이너의 SYS_ADMIN 추가와 seccomp/AppArmor 해제도 기존 그대로이며 완전한 호스트 격리를 보장하지 않는다. Codex CLI를 갱신하거나 container 패키지를 바꾼 뒤에는 위 `docker build` 명령으로 이미지를 다시 만든다. 실행 스크립트만 변경한 이번 적용에는 이미지 재빌드나 앱 클라우드 재배포가 필요하지 않다.
