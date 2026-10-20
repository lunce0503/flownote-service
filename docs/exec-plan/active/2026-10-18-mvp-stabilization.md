# Flownote 핵심 MVP 안정화

작성: 2026-10-18. 상태: 별도 snapshot의 구현 후보 생성 종료(action_required), full 검증·원본 채택·릴리스 대기.

## 목표

핵심 흐름인 노트·캔버스 기록 → 저장·재열기 → 플래너 연결의 신뢰성을 높인다. 기능 확장에 앞서 코드 검토에서 확인한 입력 유실 위험, 동시 저장 덮어쓰기, 전체 본문 목록 읽기, 중지된 AI의 정상 기능 노출을 해소한다. 운영 재현·수정·배포 완료와 정적 검토의 위험을 구분해 기록한다.

## 기능별 소유 계획

| 순서 | 우선순위 | 계획 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | 높음 | [노트 저장·화면 이동 복구](../../design-docs/blog/note-save-recovery-plan.md) | 빠른 이동·실패·새로고침 뒤 최신 입력 복구 및 계정 격리 |
| 2 | 높음 | [플래너 동시 편집 충돌 방지](../../design-docs/planner/concurrent-edit-plan.md) | stale 저장 거부, 기존 일기·시간표 보존 |
| 3 | 중간 | [노트 메타 목록·단건 조회](../../design-docs/blog/note-query-split-plan.md) | summary 본문 읽기 0회, 단건은 해당 본문만 읽기 |
| 4 | 중간 | [AI 가용성·메뉴·오류 정합성](../../design-docs/agent/capability-ui-plan.md) | disabled 안내 일치, 오류를 AI 응답으로 저장하지 않음 |

## 영향 범위와 계약

- `flownote/`: 노트 저장 큐·초안·API·목록·편집기, diary 버전·충돌 UX, capability·Agent 오류, 신규 cloud 회귀 검증.
- `flownote-canvas/`: Notes 메타 목록·단건 조회와 기존 소비자 호환.
- `flownote-serve/`: Diary 조건부 저장과 동시성·멱등성.
- `flownote-server/`: Diary revision 등 필요한 Flyway migration. 최신 migration 번호를 실제 코드에서 확인한다.
- `flownote-API/`: 기존 gateway 라우팅과 계약 유지; 필요한 경우에만 수정한다.
- `flownote-mobile/`, `flownote-ai/`, `automation/`: API 소비자 조사 대상. 기존 계약을 유지할 수 있으면 구현 변경은 하지 않는다.
- 앱 인증·권한을 약화하지 않고 초안·본문·토큰을 보고서·테스트 산출물에 기록하지 않는다.

## 실행 방식

요청한 백그라운드 Codex는 별도 snapshot에서 위 네 계획을 순서대로 구현한다. 원본 작업 트리의 동시 변경을 덮어쓰지 않는다. 기존 자동 피드백 release는 migration과 설정 변경을 차단하므로 해당 큐에 위장 입력하지 않는다.

모델은 구현·회귀 테스트·문서 갱신과 실행 가능한 검증을 수행하고, 후보 patch·구조화된 결과·진행 로그를 남긴다. cloud credential·앱 사용자 인증 파일·production 데이터·원본 업로드는 제공하지 않는다. 외부 앱 호출·메일·임의 commit/push·직접 배포는 실행하지 않는다. 이는 구현 후보 실행 경계이며 릴리스 완료를 의미하지 않는다.

신뢰한 후속 릴리스 단계는 후보 전체 diff·검증·API 계약·보안/UX를 리뷰하고 원본 소스의 기준 일치를 확인한 뒤 채택한다. 기존 지침의 staging-first 배포는 이 후속 단계에서 수행하며, 이번 계획·백그라운드 등록 응답에서 완료됐다고 표시하지 않는다.

## 단계와 상태

- [x] 네 문제의 코드 근거와 기능별 최소 수정·예외·완료 기준 작성.
- [x] 기능별 설계 문서와 실행 계획·색인 연결.
- [x] 별도 snapshot과 백그라운드 작업 등록, `thread.started`·`turn.started` 및 systemd active/running 확인.
- [ ] 노트 입력 복구와 회귀 테스트.
- [ ] 플래너 revision·충돌·재전송 계약과 회귀 테스트.
- [ ] 노트 summary/detail 분리와 소비자 호환 테스트.
- [ ] AI capability·오류 처리와 회귀 테스트.
- [ ] 영향 프로젝트 검사와 전체 diff 리뷰, 실행 결과·버그·소유 문서 갱신.
- [ ] 기준 소스 동일성 확인 후 후보 채택.
- [ ] 실제 staging migration·브라우저 E2E, 동일 소스 production 배포·health·배포 ID 기록.

## 검증과 배포

| 대상 | 검증 |
| --- | --- |
| 계획 문서 | 파일 존재·상대 링크·핵심 요구·`git diff --check` |
| 웹 | `cd flownote && yarn verify`, 의미 있는 초안·충돌·capability 단위 테스트 |
| Canvas Go | `cd flownote-canvas && go test ./...` |
| Diary Go | `cd flownote-serve && go test ./...` |
| Spring/Flyway | `cd flownote-server && ./gradlew test`, staging 실제 migration |
| Gateway 변경 시 | `cd flownote-API && uv run pytest` |
| 클라우드 | 신규 저장 복구·두 클라이언트 경합·목록/상세·disabled AI E2E와 기존 전체 회귀 |

로컬 앱 서버·Compose·production 데이터 시험은 금지한다. 컨테이너는 격리 실행·빌드·브라우저 도구로 사용할 수 있다. 환경 제약으로 실행하지 못한 검사에는 명령·원인·다음 조치를 적고 테스트를 약화하지 않는다.

실행 코드 변경은 `node scripts/deploy-cloud.mjs release all` 또는 실제 영향 서비스별 release로 staging을 먼저 통과한다. 호환 API·migration·웹 이행 순서는 플래너/노트 계획의 계약에 맞춰 릴리스에서 검증한다. 계획 문서만 변경한 현 시점의 Vercel release는 구현 후보와 합쳐 수행할 후속 배포로 남기며, 백엔드 실행 산출물은 아직 바뀌지 않았다.

## 가정과 제외 범위

현 저장소·로그의 사용자 ID와 인증 계약을 유지한다. 노트 자동 병합·새 검색 엔진·전체 오프라인 앱·IDLE/Remote 확장·AI 학습은 제외한다. 필수 migration은 사용자 요청의 플래너 충돌 방지 구현에 포함되며, 별도 피드백 자동화의 허용 목록을 우회하지 않는다.

## 의사결정 로그

| 날짜 | 결정 | 근거 |
| --- | --- | --- |
| 2026-10-18 | 데이터 보존 문제를 먼저 구현 | MVP 가치가 기록·저장·재사용의 신뢰성에 의존 |
| 2026-10-18 | 메타 목록을 additive 계약으로 추가 | Expo·Agent 등 기존 본문 목록 소비자와 호환 필요 |
| 2026-10-18 | 백그라운드 구현과 신뢰 릴리스를 분리 | 원본 동시 변경 보호, migration과 cloud 자격의 책임 구분 |

## 실행 기록

계획 작성 시점에는 구현·재현 시험·배포를 아직 수행하지 않았다. 백그라운드 실행 식별자, source commit, 결과 위치와 확인 명령은 작업 등록 후 이 절에 기록한다.

### 백그라운드 작업 등록 정보

- 실행 ID: `20261018T022603Z-mvp-stabilization`
- systemd unit: `flownote-codex-20261018T022603Z-mvp-stabilization.service`
- 원본 기준 commit: `21d2d9441c5338cbd2c9cd7394fd580715b1faaf`
- 결과 위치: `/home/kwon/.local/state/flownote-codex/manual/20261018T022603Z-mvp-stabilization/worker-state/runs/20261018T022603Z-mvp-stabilization`
- 상태 확인: `systemctl --user status flownote-codex-20261018T022603Z-mvp-stabilization.service`
- 로그 확인: `journalctl --user -u flownote-codex-20261018T022603Z-mvp-stabilization.service --no-pager`
- 실제 시작 확인: systemd `active/running`, Codex `thread.started`·`turn.started`. 모델은 기존 자동화 기준 `gpt-6.1-sol`을 사용한다. 종료 후 `final.json`, `change.patch`, `metadata.txt`로 구현·검증 결과를 확인한다. 원본에 자동 반영하거나 배포하지 않는다.

- 후보 기준 snapshot commit: `31d6a08f7451535308c3e4276a41f9a5c6599dd7`. 계획을 포함한 private snapshot이며 원본 저장소의 commit/push는 수행하지 않았다.
- 실행 등록은 기존 컨테이너 runner를 private 상태 디렉터리에 복제하고 수동 계획용 prompt·task label만 지정했다. 저장소 자동화 코드·기존 timer·메일·배포 정책은 변경하지 않았다.

## 2026-10-19 상태 정정

worker는 2026-10-18T02:48:52Z에 exit 0으로 종료했고 final.json은 action_required다. Node 23개 통과와 후보 patch는 있으나 Yarn/Go/Java 도구 부재로 full build·backend 검사와 cloud E2E를 수행하지 못했다. 원본 채택·배포는 아직 없다. 노트의 초안·조회 개선은 [Markdown 게시글 개편](../completed/2026-10-19-blog-markdown-workspace.md)에서 현재 소스와 재검증해 이어간다. 플래너·AI 후보는 별도 미완료 항목으로 유지하며 실행 중이라고 표시하지 않는다.
