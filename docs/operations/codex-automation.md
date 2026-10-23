# Codex 자동화 운영 기준

## 목적과 경계

Flownote의 Codex 자동화는 반복되는 저장소 점검, CI 실패 수정 후보 생성, staging 실패 분석, 신규 사용자 피드백 분류를 보조한다. 기준 구현은 `automation/codex/`이며 Bash가 실행 격리와 산출물을 책임지고 systemd user unit이 예약·이벤트 실행을 책임진다.

자동화의 업무 범위와 배포 정책은 다음과 같다. 이는 아래의 Codex full-access 실행을 기술적으로 제한하는 sandbox 보장은 아니다.

- 모델은 개발 작업 트리 대신 별도 snapshot/worktree를 사용한다. 신뢰 컨트롤러만 소스 동일성 검사와 운영 검증 후 patch를 원본에 채택한다.
- production 데이터와 비밀값 조회는 모델의 허용 업무가 아니다. full-access에서 마운트된 인증 파일 접근까지 기술적으로 차단하는 것은 아니다.
- 모델은 commit, push, PR, 배포를 직접 실행하지 않는다. 원본 저장소의 자동 commit/push는 없다.
- 주간 리뷰·CI·staging 분석은 기존 후보 전달 방식이며, 피드백은 2026-10-14부터 별도 신뢰 컨트롤러의 자동 구현·검증·배포 경로를 사용한다.
- production 배포는 계속 `docs/DEPLOYMENT.md`의 staging-first 절차를 따른다.

## 구조

```text
systemd timer 또는 inbox.path
        ↓
oneshot user service
        ↓
전용 bare clone에서 detached worktree 생성
        ↓
codex exec --model gpt-6.1-sol # 기본 config의 provider 사용
        ↓
--ephemeral --json --output-schema
        ↓
final.json + trace.jsonl + change.patch
        ↓
사람 검토와 기존 품질·배포 절차
```

사용자 피드백은 별도 경로를 사용한다.

```text
user_feedback INSERT
        ↓
token 보호 HTTPS feed (연락처·user_id 제외)
        ↓ 매일 00:00 UTC polling (24시간 주기)
private source snapshot → feedback-implement (Codex full access, 소스 rw, cloud 도구/credential 미제공)
        ↓ 변경 정책·credential-free 빌드/테스트·독립 read-only 리뷰
trusted release controller → staging deploy + cloud E2E → 동일 소스 production + health
        ↓ 원래 소스 동일성 확인 후 patch 반영; 성공·실패 이력 보존
notification-only Codex 실행 → Gmail → lunce0503@gmail.com
```

전용 clone은 `~/.local/share/flownote-codex/repo`, 실행 상태는 `~/.local/state/flownote-codex/`에 둔다. 이 상태 디렉터리는 Git 추적 대상이 아니며 비밀 저장소로 사용해서도 안 된다. 저장소 작업은 `flownote-codex-automation:0.160.0` 컨테이너에서 실행한다. source snapshot과 결과 디렉터리 외에는 기본 `config.toml`, 로그인 캐시, config가 참조하는 model catalog만 파일 단위로 mount한다. 2026-10-22 사용자 요청으로 모든 작업과 알림의 Codex 권한을 full access/승인 없음으로 통일했다. named permission profile의 Codex home 차단과 shell network 제한은 더 이상 적용하지 않는다. 기존 Docker 마운트와 배포 정책은 별개로 유지한다.

named permission profile을 지원하는 Codex CLI `0.160.0` 이상을 사용한다. 기본 config에서 선택한 provider와 고정 모델 `gpt-6.1-sol`이 인증 계정에서 사용 가능한지는 timer와 path watcher를 활성화하기 전에 수동 `weekly-review`로 확인한다.

## 권한 모델

- 6종 runner 작업과 메일 알림은 `sandbox_mode="danger-full-access"`, `approval_policy="never"`를 명시한다. 기본 config도 같은 값이며 다른 값으로 바뀌더라도 이 실행 옵션이 우선한다.
- 기존 task별 named permission profile과 알림의 `--approve-for-me`를 제거해 권한 설정 체계 혼용을 없앴다. Codex sandbox나 승인 검토 에이전트를 통한 차단은 없다.
- Docker에서는 구현/CI worktree만 rw, 리뷰·분석 worktree는 ro로 mount한다. 프롬프트의 비변경·비배포 역할, 고정된 변경 정책·독립 리뷰·staging-first release는 유지한다. host runtime에는 Docker 마운트 제한이 없으므로 별도 주의가 필요하다.
- 저장소 작업과 Gmail 알림은 기본 `config.toml`을 사용하며 `--model gpt-6.1-sol`로 모델을 고정한다. `--profile`과 `--ignore-user-config`는 지정하지 않는다.
- 컨테이너의 config와 model catalog는 read-only이고, `auth.json`은 토큰 갱신을 위해 writable mount한다. 현재는 모델 명령이 이 인증 파일을 읽거나 수정하지 못하도록 기술적으로 차단하지 않는다. 인증 정보를 출력하거나 프롬프트에 포함해서는 안 된다.
- 저장소 분석에서 plugin, app, MCP를 모두 비활성화하고 프롬프트의 비배포 역할을 유지한다. 모델 실행 컨테이너의 추가 SYS_ADMIN 및 seccomp/AppArmor 해제는 기존 그대로이며 강한 격리를 보장하지 않는다. 빌드/테스트 전용 컨테이너는 credential 없이 network=none으로 실행한다.
- Codex CLI 인증 파일이나 API 키를 저장소, unit 파일, 로그에 기록하지 않는다.
- runner와 unit은 FactChat, OpenAI, Railway, Vercel, GitHub, AWS, DB credential 환경 변수를 제거한다.
- shell environment policy는 모델이 실행하는 명령에서 key·secret·token 변수를 제외한다.
- systemd unit은 `NoNewPrivileges`, private `/tmp`, read-only 시스템 디렉터리 보호를 적용한다.
- 피드백 feed의 서비스 토큰은 constant-time 비교를 사용하고 systemd credential과 Railway secret variable로만 주입한다.
- 신뢰할 수 없는 피드백은 외부 도구·배포 credential 없는 구현 실행에서 처리한다. 정책·테스트·독립 리뷰 후 고정된 컨트롤러만 배포한다. 알림에는 원문 대신 길이를 제한한 구조화 결과만 전달한다.

## 트리거

### 주간 리뷰

`flownote-codex-weekly.timer`가 매주 일요일 03:30 서버 로컬 시각에 읽기 전용 리뷰를 실행한다. timer는 설치만으로 활성화되지 않으며 첫 수동 결과를 확인한 뒤 운영자가 활성화한다.

systemd user manager에 provider API key를 import하지 않는다. `~/.codex/config.toml`과 파일 기반 로그인 캐시 `~/.codex/auth.json`의 존재와 권한을 첫 수동 실행에서 확인한다.

### CI 실패

CI 또는 webhook adapter가 민감 정보를 제거한 실패 로그를 `inbox/ci-fix-<id>.log`로 원자적으로 이동한다. dispatcher는 로그를 신뢰할 수 없는 데이터로 취급하고 결과 patch만 보존한다.

### Staging 실패

배포 도구가 실패 로그를 `inbox/staging-triage-<id>.log`로 넣으면 읽기 전용 분석을 실행한다. 자동 재배포나 cloud 설정 변경은 허용하지 않는다.

### 사용자 피드백

`flownote-codex-feedback.timer`가 production 게이트웨이의 `/api/feedback/automation`을 매일 00:00 UTC(한국 시각 09:00)에 24시간 주기로 조회한다. 최대 15초의 무작위 지연을 적용하며 다음 수집까지 최대 약 24시간 대기할 수 있다. 최초 실행은 현재 cursor를 기록해 기존 항목을 건너뛰며, 이후 생성된 피드백만 `feedback-triage-<id>.log`로 원자적으로 큐에 넣는다. 네트워크 오류나 응답 검증 실패 때 cursor를 진행하지 않는다.

feedback/dispatch service의 `FLOWNOTE_AUTOMATION_FEEDBACK_RELEASE=1`이 구현 컨트롤러로 분기한다. 기본 플래그 없는 명령행 실행은 이전 읽기 전용 분석을 유지한다. 모델은 Gmail/GitHub/Sites/Visualize/Railway 도구를 사용할 수 없으며 코드·테스트만 수정한다. 고정 호스트 컨트롤러가 정책 검증·credential-free 테스트·독립 리뷰·staging-first 배포를 담당한다. 인증/권한, DB migration, 의존성/빌드/자동화 설정 변경과 모호한 요구는 중단한다. 실행별 source snapshot·patch·검증·배포 영수증을 보존하며 운영 검증 후 원본 소스 동일성을 확인하고 patch를 반영한다. DB의 사용자 피드백 상태를 자동으로 변경하지는 않는다.

성공·중단의 구조화 결과를 Gmail 전용 실행으로 지정 수신자에게 알린다. 검증 실패는 failed 큐에 남기고 자동 무한 재시도하지 않는다. 이전 성공 Railway/Vercel deployment ID를 확인해 `docs/DEPLOYMENT.md` 절차로 롤백하며 DB나 cloud 리소스를 임의로 삭제하지 않는다. 자세한 정책·수동 실행은 [자동화 README](../../automation/codex/README.md)를 따른다.

검증/독립 리뷰에서 명확한 기술 결함이 발견되면 최대 2회 자동 보정한다. 매회 최초 snapshot 대비 전체 diff를 정책 검사·재검증·재리뷰하며 린트/type 오류 억제나 테스트 skip은 차단한다. 고위험·요구사항 모호성·validation의 소스 변조는 자동 보정하지 않는다. 누적 patch만 동일 소스 cloud gate를 통과한 뒤 채택한다.

## 산출물과 보존

각 실행은 고유한 run 디렉터리에 구조화된 최종 결과, 전체 JSONL 이벤트, stderr, Git 상태, patch, 기준 commit과 `model=gpt-6.1-sol` 표시를 남긴다. 운영자는 다음 순서로 결과를 확인한다.

1. `metadata.txt`의 종료 코드와 기준 commit을 확인한다.
2. `final.json`의 상태, finding, 검증 결과를 확인한다.
3. `git-status.txt`에서 변경 범위를 확인한다.
4. 리뷰/CI/staging 작업의 `change.patch`는 사람이 검토·적용한다.
5. 피드백 자동 배포는 `staging-receipt.json`, `production-receipt.json`과 source 채택 결과를 확인한다. 실패한 후보는 같은 검증을 생략하지 않고 명시적으로 재시도한다.

자동화 결과를 장기 보존해야 하면 비밀값을 제거한 요약만 `logs/report/`에 기록한다. 원본 CI·배포 로그와 JSONL trace는 저장소에 커밋하지 않는다.

## 설치와 복구

설치·수동 실행·중지 명령은 `automation/codex/README.md`를 따른다. 장애가 반복되면 timer와 path watcher를 먼저 비활성화한다. runner는 기존 run 디렉터리를 덮어쓰지 않으며, 동시에 하나의 실행만 허용한다.

전용 clone이 손상된 경우 자동화 실행을 중지한 뒤 해당 clone만 새로 준비한다. 개발 작업 트리나 cloud 리소스를 자동 복구 과정에서 삭제하지 않는다.
