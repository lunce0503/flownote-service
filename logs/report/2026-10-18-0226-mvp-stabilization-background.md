# 핵심 MVP 안정화 계획 및 백그라운드 구현 등록

## 작성 결과

기능별 계획을 docs/design-docs/blog/note-save-recovery-plan.md, docs/design-docs/blog/note-query-split-plan.md, docs/design-docs/planner/concurrent-edit-plan.md, docs/design-docs/agent/capability-ui-plan.md에 작성했다. 통합 실행 계획은 docs/exec-plan/active/2026-10-18-mvp-stabilization.md다. design-docs 색인, active 색인, docs/PLANS.md를 연결하고 Blog 코드맵의 화면 이탈 저장 보장 표현을 현재 코드에 맞게 정정했다.

계획은 정적 코드 위험의 재현, 최소 구현, 계약·호환성·데이터 보존, 실패 UX, 단위/클라우드 회귀, staging-first 배포 완료 기준을 포함한다. 이번 계획 작성 단계에서 제품 구현은 변경하지 않았다.

## 실행과 확인

- 실행 ID: `20261018T022603Z-mvp-stabilization`.
- systemd unit: `flownote-codex-20261018T022603Z-mvp-stabilization.service`.
- source commit: `21d2d9441c5338cbd2c9cd7394fd580715b1faaf`.
- private snapshot commit: `31d6a08f7451535308c3e4276a41f9a5c6599dd7`, 파일 898개.
- 결과 위치: `/home/kwon/.local/state/flownote-codex/manual/20261018T022603Z-mvp-stabilization/worker-state/runs/20261018T022603Z-mvp-stabilization`.
- 모델: 기존 자동화 기준 gpt-6.1-sol. CLI 0.163.0의 비대화형 exec와 기존 격리 컨테이너 runtime 사용.
- 실제 확인: systemd ActiveState=active, SubState=running, MainPID 존재; trace에 thread.started와 turn.started 발생.
- 계획 전체를 전달한 구현 worker 한 개다. 기존 피드백 큐·일간 timer·메일은 호출하거나 변경하지 않았다.

일회성 launcher는 기존 runner의 실행 격리·credential 분리·patch 수집을 재사용한다. 수동 작업용 task label과 prompt만 private 상태 디렉터리에 두고, 별도 Git snapshot에서 실행한다. 모델은 필요한 Flyway migration을 포함해 구현·회귀 테스트·문서 갱신을 수행할 수 있다. cloud credential과 원본 작업 트리는 제공하지 않으며 commit/push·직접 배포·외부 메시지는 금지했다.

## 검증

- 계획 문서 9개의 존재·상대 링크 23개 검사 통과.
- git diff --check 통과.
- private launcher bash -n 통과.
- systemd 실제 실행과 Codex 세션 시작 확인.
- 구현·테스트·후보 patch·배포 완료는 아직 확인되지 않았다. 최종 결과는 실행 디렉터리의 final.json, change.patch, metadata.txt를 확인한다. 구현 결과는 원본에 자동 채택하지 않는다.

## 후속 조치와 배포

이번 단계는 계획 작성 및 백그라운드 후보 구현 시작이다. 별도 worker는 credential 없이 가능한 검사와 실행 불가 명령·원인을 기록한다. 신뢰한 후속 단계에서 전체 diff·API·보안·UX를 리뷰하고 실제 빌드·테스트, 기준 소스 동일성 검사, staging 검증 뒤 후보를 채택·배포한다.

계획 문서 변경의 클라우드 반영도 후속 구현 릴리스와 함께 처리하도록 남겼다. 이번에는 Docker 앱 빌드와 Vercel/Railway 재배포를 수행하지 않았다. 필요한 표준 명령은 node scripts/deploy-cloud.mjs release all이며, 먼저 staging migration·실제 cloud E2E를 통과하고 동일 소스를 production에 배포해야 한다. 백엔드 실행 산출물은 이 계획 작성 단계에서 바뀌지 않았다.

Codex 실행 방식 확인에는 설치된 CLI와 [공식 비대화형 실행 문서](https://learn.chatgpt.com/docs/non-interactive-mode)를 사용했다.
