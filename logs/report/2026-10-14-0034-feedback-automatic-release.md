# 피드백 자동 구현·배포 활성화

## 적용 범위

사용자 승인에 따라 기존 하루 한 번의 피드백 분석·메일 흐름을 자동 구현·검증·독립 리뷰·staging-first 운영 배포 흐름으로 확장했다. 모델은 `gpt-6.1-sol`, 기본 OpenAI 구성과 기존 ChatGPT 인증을 유지한다. timer는 매일 00:00 UTC(한국시간 09:00, 최대 15초 지연)다.

수정 대상은 `automation/codex/`, 배포 컨트롤러의 source override/guard, 소유 운영·제품 문서다. 기존 앱 변경은 되돌리지 않았다. 모델은 실행별 private Git snapshot을 사용하고 원래 저장소를 commit/push하지 않는다. 신뢰 컨트롤러만 운영 배포·헬스체크 뒤 원래 소스가 바뀌지 않은 경우에 patch를 채택한다.

## 안전 경계

- 코드 구현 모델과 독립 리뷰 모델에는 cloud credential·plugin·MCP를 주지 않는다.
- 변경 허용 목록, 최대 60파일/512KiB, 회귀 테스트 포함, 기존 cloud E2E 유지 정책을 적용한다.
- 자동화/배포 스크립트·의존성/빌드 설정·인증/권한·DB migration, 삭제·rename·symlink는 사람이 검토해야 한다.
- 신뢰된 의존성 설치만 별도 네트워크 컨테이너에서 실행하고 앱 빌드·단위 테스트는 credential 없는 `network=none` 컨테이너에서 실행한다.
- validation이 소스나 control 파일을 바꾸면 중단한다. 테스트·독립 리뷰·소스 guard 실패는 배포하지 않는다.
- 신뢰 스크립트가 스테이징과 실제 cloud E2E를 통과한 동일 소스만 production으로 배포한다. 모호한 요구와 검증 실패는 실패 큐에 보존하고 메일을 보낸다.
- 이전 production 배포 ID를 `rollback-reference.json`에 보존한다. 부분 배포 실패 때 이를 기준으로 `docs/DEPLOYMENT.md` 절차를 따르며 DB나 서비스를 임의 삭제하지 않는다.

TDD 스킬에 따라 정책 우회·실패 시 배포 중단·systemd 런타임 회귀 테스트를 추가했다. 보안 스킬은 credential 분리, 허용 파일 제한, offline 테스트, 소스 guard에 반영했다. 배포 스킬은 staging-first 검증과 이전 성공 배포 ID 보존에 반영했다.

## 검증·설치

- `node --test automation/codex/tests/feedback-release.test.mjs`: 32/32 통과. PATH/제품 소유 문서, 최대 2회 기술 보정과 전체 재검증, 고위험·모호한 리뷰 차단, validator 소스 변조 차단, review의 무단 변경 주장 차단을 포함한다.
- `automation/codex/tests/run-tests.sh`: 13/13 통과. 활성 경로 분기와 실패 알림을 확인하며 실패가 done으로 처리되지 않는 것을 검증했다.
- `bash -n`, Node syntax check, `git diff --check`: 통과.
- `systemd-analyze verify` 해당 service 2개: 통과. `--user verify`는 이 shell의 RuntimeDirectory 초기화 오류로 실패했으므로 system 모드 정적 검사와 실제 user manager read-back으로 확인했다.
- `docker build --tag flownote-codex-automation:0.160.0 automation/codex/container`: 통과. 실제 Node 24 실행 확인.
- `automation/codex/install.sh --no-clone`: 새 binary link, unit 설치와 daemon reload 완료. feedback/dispatch service의 `FLOWNOTE_AUTOMATION_FEEDBACK_RELEASE=1`, Timeout 6시간을 read-back했다. 기존 daily/weekly timer는 active다.

## 클라우드 배포 경로 검증

소유 문서/신뢰 배포 스크립트 변경에 맞춰 `node scripts/deploy-cloud.mjs release web`을 실행했다. 백엔드 앱 코드와 Dockerfile 변경이 없어 Railway 앱 재배포는 생략했다. 이는 아래 피드백 기능 구현 결과와 별개의 배포 경로 검증이다.

- 실제 스테이징 browser tests 17/17 통과.
- staging web: `dpl_9KSiGr785MD8GqZB7PSAiHL1ycay`, READY. <https://flownote-react-staging-h4wruzn9q-flownote-service.vercel.app>
- production web: `dpl_FjapfRRDsiUNdJMc7PF8b5hozQRf`, READY. <https://flownote-react-ftolnblg0-flownote-service.vercel.app>
- 해당 web release 지문: `2530aaeed7399f716eaa7ecfabe3b60c91bf08b1e38f9990e15190e465ba7aac`.
- staging/production 웹 자산·API 200, 비인증 본인 조회 401, mobile 설정 환경 격리와 헬스체크 통과.
- 이후 컨트롤러 런타임의 PATH/Node 위치와 offline validation을 로컬 자동화 실행 산출물에 추가 검증했다. 이 변경은 앱 번들을 변경하지 않는다. 다음 실제 피드백 배포는 새 snapshot에서 자체 cloud gate를 다시 통과해야 한다.

## 실제 피드백 재처리

오늘 분석만 완료했던 4건의 원본을 보존하고 새 경로에 재큐잉해 `flownote-codex-dispatch.service`를 시작했다. 초기 host PATH 문제 2건은 수정한 뒤 원본/reason을 retry-history에 보존하고 한 번 재큐잉했다. `flownote-codex-feedback-retry-20261014.service`는 현재 dispatcher lock 해제 후 이 재큐잉 작업을 한 번 처리한다.

구현 모델이 기존 회귀 기준과 제품 해석의 충돌을 보고한 1건은 action_required로 중단했고 배포하지 않았다. 해당 기록은 별도의 model final.json과 change.patch에 보존했다. 정상 안전장치 작동이며 구현 완료나 배포 완료로 표시하지 않는다.

PDF 읽기 후보는 지침상 갱신이 필요한 `docs/PRODUCT_SENSE.md`가 허용 목록에서 빠져 최초 policy gate가 차단했다. 제품 소유 문서만 허용하도록 수정하고 회귀 테스트를 추가했다. 보존된 동일 요청의 구현 후보를 신뢰 운영자가 `FLOWNOTE_FEEDBACK_REUSE_RUN`으로 재사용하되 정책·빌드·독립 리뷰·cloud gate는 모두 다시 실행한다. 이 변수는 피드백이나 모델이 설정하지 않는다.

모델 snapshot에는 secret-bearing config를 복사하지 않으면서 프로젝트 rules/checklists/harness 등 Markdown 지침도 포함하도록 보완했다. 초기 복구 worker는 control plane 정정 동안 중단하고 미완료 입력을 inbox로 복구했다. 취소된 모델 컨테이너 1개만 정확한 mount/run ID로 확인해 종료했으며 관련 없는 DB 컨테이너는 건드리지 않았다. 원본 피드백과 작업 트리를 삭제하지 않았다.

`flownote-codex-feedback-pilot-20261014.service`에서 PDF 후보 재검증을 진행한다. 00:48 UTC 기준 trusted dependency install, credential-free offline web build, 변경 파일 lint와 Node 단위 테스트 7건이 통과했고 working tree 청결 검사를 통과했다. 독립 리뷰와 cloud gate가 남았다. `flownote-codex-feedback-retry-final-20261014.service`는 이 release lock 해제 뒤 남은 입력을 처리한다. 설정/제품 해석상 검토 보류로 끝난 요청은 기술 오류와 구분해 남긴다.

00:51 UTC 독립 리뷰 결과 PDF 후보는 모바일 가로 화면에서 PDF 표시 영역이 축소되는 문제와 새 viewport E2E 조건/기존 높이 계산 충돌 2건으로 action_required가 됐다. 빌드 성공만으로 cloud release를 실행하지 않았으며 `deployment_performed=false`다. 실제 리뷰 파일은 `runs/20261014T004719Z-feedback-release-review-380874/final.json`, 최종 실행은 `runs/20261014T004610149Z-feedback-release-380353/final.json`에 있다. 실패 입력 옆 latest-result JSON으로 최신 원인을 연결하고 이전 실패 이유는 보존했다.

현재 요청 해석/회귀 기준의 검토 보류 2건과 PDF 리뷰 보류 1건은 실패 큐에 남으며, 나머지 입력은 최종 retry worker에서 순차 처리한다. 모든 새 기능이 운영에 반영됐다고 보고하지 않는다. 후속 자동 결과는 개별 영수증과 알림으로 확인한다.

## 기술 오류 자동 보정

실제 관성 이동 후보의 React refs 린트 실패를 확인해 명확한 기술 오류에 한해 최대 2회 자동 보정을 추가했다. 고위험·요구사항 모호성·권한/credential/migration 관련 리뷰와 validator의 소스 변조는 보정하지 않는다. 오류 억제 주석과 테스트 skip/only도 차단한다. 보정 뒤에도 전체 누적 diff 정책·빌드/테스트·독립 리뷰·cloud gate를 다시 통과해야 한다. 실패 후 무한 재배포를 추가하지 않았다.

누적 patch는 원래 snapshot 대비 기록하며 UTF-8 스트림과 마지막 공백/개행을 보존해 운영에 배포한 코드와 채택한 소스가 달라지지 않도록 했다. 최종 실패 메일에는 실제 리뷰 findings를 포함한다.

`flownote-codex-feedback-momentum-repair-20261014.service`의 `runs/20261014T012744415Z-feedback-release-385940/`에서 이전 동일 요청 후보를 재사용해 보정 중이다. 01:37 UTC 기준 보정된 web의 offline build, lint, 단위 테스트 15개가 통과했고 working tree 청결 검사를 통과했다. 전체 diff 독립 리뷰가 진행 중이며 운영 배포 성공으로 보고하지 않는다.

01:39 UTC 관성 후보의 최종 독립 리뷰에서 mouse pointer exit 뒤 관성이 취소되지 않는 중간 심각도 결함이 발견됐다. 최대 2회 보정 한도를 소진한 뒤 검토 요청으로 종료했으며 배포하지 않았다. `runs/20261014T013639Z-feedback-release-review-388650/final.json`에 재현 근거와 권장 수정이 있고 해당 findings를 결과 메일에 포함했다.

`flownote-codex-feedback-pdf-repair-20261014.service`가 release lock 해제 뒤 PDF 후보를 동일한 최대 2회 보정·전체 검증 경로로 순차 재처리한다. 이 임시 실행과 무관하게 일간 feedback service의 자동 배포 활성화와 모델 고정은 유지된다. 현재 확인된 개별 새 피드백의 운영 배포 완료는 없으며, 이 보고서는 자동화 구성/설치 완료와 실제 안전장치/보정 검증 결과를 보고한다.

현재 진행 중인 피드백의 실제 운영 반영 여부는 실행별 `final.json`의 deployment_performed와 staging/production 영수증으로 확인해야 한다. 이 보고서의 17개 cloud test 통과는 새 피드백 4건의 구현 완료를 의미하지 않는다. 진행 결과는 기존 Gmail 알림기로 자동 통지한다.

자동화 활성화 결과 메일도 별도로 한 번 발송했다. `runs/20261014-feedback-release-activation/email-final.json`의 `sent=true`와 지정된 수신자 일치를 확인했다. 첫 실행의 환경 오류 2건과 제품 판단 보류 1건 역시 실패/검토 알림을 전송했으며, 이를 성공 배포로 기록하지 않았다.

소유 문서: [자동화 운영 기준](../../docs/operations/codex-automation.md), [제품 동작](../../docs/product-specs/user-feedback-automation.md), [실행 README](../../automation/codex/README.md).
