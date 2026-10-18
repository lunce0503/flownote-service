# IDLE 계획의 Flownote 편입

작성: 2026-10-14. 상태: 계획 편입 완료, 실행 코드 이전 및 기능 구현 전.

## 목표와 성공 기준

IDLE의 개발 환경 계획을 Flownote의 개발 작업 공간 계획으로 편입한다. 사용자는 프로젝트와 목표를 선택하고, 에이전트 실행을 조회·취소하며, 파일 변경을 검토하고 결과를 노트·작업에 연결한다. 데스크톱 편집기와 모바일 제어도 같은 프로젝트·실행 계약을 사용한다.

계획의 소유 저장소는 `Flownote/service`다. `IDLE`은 구현을 참고하고 선별적으로 이전할 원본으로 보존한다. 별도 IDLE 제품 로드맵 대신 이 계획에서 진행 상황을 관리한다. 이번 작업은 계획과 문서 연결만 수행하며 소스 복사, 저장소 삭제, 패키지 변경, 서비스 설치·재시작·배포는 포함하지 않는다.

구현 완료 기준:

- Flownote 인증 사용자에게 허용된 프로젝트·실행만 조회·제어된다.
- 단일 목표의 실행, 제한 초과, 취소, 실패, 변경 검토를 자동 테스트로 재현한다.
- 새로고침·클라이언트 재접속·워커 재시작 뒤 마지막 기록과 종료 사유를 조회한다.
- 원본 프로젝트 변경과 격리 실행의 patch를 구분하고, 오래된 기준 소스의 patch 적용을 차단한다.
- 웹·데스크톱·모바일이 동일한 실행 ID와 이벤트 순서를 사용한다.
- 각 단계의 코드·계약·검증·릴리즈 근거를 이 문서에 기록한다.

제품 행동의 기준은 [개발 작업 공간 사양](../../product-specs/development-workspace.md)이다.

관련 연구: [flownote-agent 편입 계획](2026-10-14-flownote-agent-integration.md). 공통 실행·이벤트·확인 계약은 재사용하고, 노트·작업 도구와 코딩 도구의 권한은 각각 검증한다. 노트 에이전트 연구 코드 편입은 이 IDLE 코드 이전 단계의 완료를 의미하지 않는다.

## 기존 구현과 편입 대상

IDLE의 초기 계획과 현재 구현은 다르다. 특히 승인 대기와 Docker 격리는 현재 코드에 이미 있지만, Flownote에서 검증된 구현은 아니다.

| IDLE 자산 | 현재 근거 | Flownote 편입 방향 |
| --- | --- | --- |
| 에이전트 루프 | `packages/agent-core`: 모델·도구·저장소 인터페이스, 제한·취소·승인 대기 | 동작 계약과 테스트를 먼저 재사용. 기존 Codex 실행 어댑터와 연결하고 필요한 코어만 선별 이전 |
| 상태·이벤트 | `packages/protocol`: Run, sequence 기반 이벤트, 승인 스키마 | `protocol/development/v1/`에서 사용자·프로젝트 소유권과 버전 계약 추가 예정 |
| 실행 API·저장소 | `apps/server`: Fastify, SQLite, 단일 개인 토큰 | 단일 토큰·SQLite 서버를 그대로 도입하지 않음. 기존 게이트웨이·세션 인증·PostgreSQL에 맞게 구현 |
| 파일·코딩 도구 | `packages/tools`: list/read/search/patch/shell/git status/diff | 프로젝트 범위 검증과 격리 워커에서 재사용. 원본 소스 채택·배포는 기존 신뢰 컨트롤러 책임 |
| 실행 격리 | `packages/sandbox`: 실행별 Git worktree·Docker, 자원 제한 | `automation/codex`의 snapshot·credential 분리·검증 정책을 기준으로 보완. 컨테이너·worktree 보존과 정리 정책 추가 |
| CLI | `apps/cli`: run/inspect/cancel | 공통 실행 계약의 관리 도구로 선별 이전. 기존 Remote에서 실행 가능한 CLI 흐름 유지 |
| 데스크톱 편집기 | `apps/desktop`: Electron/Monaco, 파일 탐색·편집·저장 | 후속 `apps/desktop/` 구현의 원본. 터미널·Git 변경·실행 제어 패널을 Flownote 계약에 연결 |
| 모바일 실행 제어 | `apps/mobile`: Expo 목표 입력·상태·코드/diff 조회 | 기존 `flownote-mobile`에 통합. 별도 Expo 앱·별도 로그인 흐름을 새로 유지하지 않음 |
| 원격 터미널 | IDLE에는 대화형 터미널이 없음 | 기존 `apps/host`·`apps/android`의 PTY·WSS·세션 계약을 유지 |
| 예약·주기 실행 | IDLE의 후속 계획 | 기존 systemd 큐·timer와 피드백 자동화 재사용. 두 번째 scheduler를 만들지 않음 |

참고 원본: [초기 루프 계획](../../../../../IDLE/docs/agent-loop-plan.md), [현재 아키텍처](../../../../../IDLE/docs/architecture.md), [데스크톱 계획](../../../../../IDLE/docs/desktop.md).

## 아키텍처와 책임

아래 경로와 API는 구현 예정이며 현재 배포된 기능을 뜻하지 않는다.

| 영역 | 소유 위치 | 역할 |
| --- | --- | --- |
| 웹 개발 화면 | `flownote/`의 capability·entity·feature·widget | 프로젝트, 실행 이력·이벤트, 파일/diff 조회·검토 |
| 모바일 제어 | `flownote-mobile/` | 목표 입력, 실행 상태, 취소·승인, 작은 화면의 diff 검토 |
| 데스크톱 | 향후 `apps/desktop/` | 로컬 프로젝트 편집, 터미널, Git 변경, 공통 실행 패널 |
| 공개 API | `flownote-API/` | 기존 세션 검증과 사용자별 라우팅·스트리밍. 컨테이너 직접 실행은 하지 않음 |
| 개발 도메인 API | `flownote-serve/` | 사용자별 프로젝트·Run·Event·Approval·Artifact 메타데이터와 명령 접수 |
| 스키마 | `flownote-server/`의 Flyway | 개발 도메인 PostgreSQL 마이그레이션 소유 |
| 실행 워커 | `automation/codex/`를 확장 | 격리된 snapshot에서 실행·검증. 워커의 제한된 작업 수신/결과 전송 계약은 구현 단계에서 추가 |
| 공유 계약 | 향후 `protocol/development/v1/` | HTTP 요청·응답, 이벤트·상태 스키마, CLI/웹/모바일 계약 |
| PC 원격 셸 | 기존 `apps/host`·`apps/android` | 기존 기기 토큰·지문 인증과 WSS·PTY 계약 유지 |

클라우드 제어 화면과 사용자 PC의 직접 원격 셸은 연결 대상·인증·실행 권한이 다르다. 개발 실행 API가 기존 PTY의 전체 OS 권한을 자동으로 상속하지 않는다. PC Remote는 기존 제품의 명시적 직접 연결 기능이며, 클라우드 API의 LAN/loopback fallback을 추가하는 근거가 아니다.

개발 실행 때문에 중지된 `flownote-ai`나 폐기된 Ollama/agent-note 기능을 다시 활성화하지 않는다. 첫 워커는 기존 Codex 인증·모델 설정을 사용하며, IDLE의 모델 어댑터는 후속 제공자 확장 시 검토한다. Railway 서비스에 Docker socket을 제공하거나 새 실행 서비스를 지금 provision하지 않는다.

## 데이터와 계약

예정 엔터티는 Project, Run, Step, ToolCall, Event, Approval, Artifact다. 클라우드 기준 데이터는 PostgreSQL이며 SQLite 이전은 필요할 때 별도 이관 작업으로 다룬다.

- Project: `user_id`, 허용 저장소 참조, worker 등록 참조. 클라이언트가 임의 호스트 경로를 지정하지 못한다.
- Run: 사용자·프로젝트, 목표, 모델, 기준 소스 지문, 상태, 제한·사용량, 최종 결과·오류, 시작·종료 시각.
- Step/ToolCall: 모델 판단·도구명, 검증된 인자, 결과 참조, 오류·소요 시간. 민감 원문은 기본 응답과 분리한다.
- Event: `run_id`별 증가하는 `sequence`, 버전, 종류, 시각, 크기 제한된 payload. 저장 후 발행한다.
- Approval: 실행·도구·인자 지문·기준 소스·만료·판정자를 묶는다. 판정 시 소유권과 최신 실행 상태를 다시 검증한다.
- Artifact: patch·diff·검증·배포 영수증·요약의 참조와 checksum. credential·원본 터미널 출력은 공개하지 않는다.
- 선택한 노트·작업의 연결은 기존 사용자별 API를 통해 수행한다. 모든 노트·캔버스를 자동으로 모델에 전달하지 않는다.

예정 공개 API는 `/api/development/projects`, `/api/development/runs`, 실행별 조회·취소·이벤트 재생/SSE·파일·diff 및 승인 판정이다. 기존 `/api/aiclient/**`와 Remote WSS v1은 유지한다. 실제 메서드·스키마·오류 코드는 1단계에서 고정한다.

Run 상태는 `queued`, `running`, `waiting_approval`, `succeeded`, `failed`, `cancelled`, `limit_exceeded`를 사용한다. terminal 상태에서 재시도할 때는 원본을 보존하고 새 Run을 만든다. 기존 자동화의 `completed`는 해당 작업 성공으로 매핑하되 배포 여부를 따로 보존한다. 이미 종료된 `action_required`는 `failed`와 검토 필요 오류 코드로 기록하며, 실제로 승인 후 재개할 실행만 `waiting_approval`로 표시한다. 후보 생성 성공과 production 배포 성공을 별도 필드·영수증으로 표시한다.

워커에는 lease·heartbeat·명령 멱등성·이벤트 중복 방지 계약이 필요하다. 첫 구현에서는 재시작된 실행의 실패 사유를 기록하고 자동 재개하지 않는다. 승인 대기·취소 경합·네트워크 단절 뒤 상태도 저장소를 기준으로 판정한다.

## 실행 정책

- 최대 단계 20을 초기 기준으로 두고 모델·도구·전체 실행의 시간과 출력 한도를 각각 설정한다.
- 일시 모델 오류만 제한 재시도한다. 변경 도구는 멱등성·실행 결과를 확인하지 않고 재실행하지 않는다.
- 잘못된 도구·인자, 반복 호출, 취소, 제한 초과는 구조화된 결과로 종료한다.
- 모델 작업은 격리된 snapshot에서 수행한다. shell과 파일 경로·네트워크·symlink 경계는 실제 실행 계층에서 검사한다.
- API/model/cloud credential은 역할별로 분리한다. IDLE의 원본 Git worktree만으로 `.env` 배제를 보장한다고 가정하지 않는다.
- 원본 소스 반영과 배포는 기존 정책·검증·리뷰·소스 동일성 검사를 통과한 신뢰 컨트롤러가 수행한다. 일반 수동 작업의 기본 결과는 검토할 patch이며 자동 배포 권한을 새로 부여하지 않는다.
- 실행 중 컨테이너를 보존하고 종료된 컨테이너·worktree·artifact는 보존 기한과 참조 상태를 확인한 뒤 정리한다. 원본 프로젝트와 기존 자동화 기록은 정리 대상에서 제외한다.
- 큰 도구 결과는 참조·요약으로 전달하며 요약의 원문 범위를 기록한다. 토큰·개인정보를 저장 전에 제거하고 사용자별 조회·SSE·artifact 다운로드 권한을 검사한다.

## 단계와 상태

### 0. 계획 편입 — 완료

- [x] IDLE 계획·현재 구현·Flownote Remote·자동화의 책임을 비교했다.
- [x] 제품 사양, 실행 계획과 문서 색인을 연결했다.
- [x] IDLE 문서에서 새 계획의 소유 위치를 안내한다.

### 1. 실행 계약과 조회 — 다음 구현

- [ ] `protocol/development/v1/`에 상태·API·이벤트·권한 계약과 기존 자동화 결과 매핑을 정의한다.
- [ ] Flyway와 `flownote-serve`에 Project/Run/Event/Artifact 및 worker lease 모델을 구현한다.
- [ ] 등록된 소유자의 실행 결과만 가져오는 어댑터를 만든다. 기존 자동화 파일을 웹에서 직접 제공하지 않는다.
- [ ] 웹에 프로젝트·이력·진행·오류·diff 조회를 만든다. 처음에는 개발 단계로 메뉴 공개를 제한한다.

완료 기준: 다른 사용자의 run ID·event cursor·artifact로 접근이 거부되고, 새로고침과 SSE 재접속 뒤 중복 없는 이력을 본다. 기존 자동화 실행·알림과 Remote 프로토콜의 동작은 유지된다.

### 2. 수동 실행과 검토

- [ ] 등록 프로젝트에서 단일 목표를 실행하는 기존 Codex 워커 어댑터를 추가한다.
- [ ] 모델/도구/저장소 인터페이스와 IDLE 코어 테스트를 선별 이전하고 패키지 관리 방식을 결정한다.
- [ ] 취소·제한·승인 대기·거절·만료·재시작 종료를 영속화한다.
- [ ] diff 검토, 검증 결과, patch 채택의 기준 소스 guard를 연결한다.
- [ ] 실행 결과 요약을 사용자가 선택한 노트·작업에 저장한다.

완료 기준: 가짜 모델·도구로 성공/실패/제한/취소/승인을 재현하고, 실제 격리 실행에서 원본 보호·credential 분리·중단 후 자식 프로세스 정리를 확인한다.

### 3. 데스크톱 작업 공간

- [ ] IDLE Electron/Monaco 원본을 `apps/desktop`으로 선별 이전하고 빌드·릴리즈 계약을 추가한다.
- [ ] 파일 탐색·다중 탭·저장·외부 수정 충돌·경로 제한을 유지한다.
- [ ] 터미널·Git 변경·에이전트 제어 패널을 통합한다. 로컬 PTY와 Remote 연결 방식을 명시적으로 구분한다.
- [ ] Linux/Windows 패키지 설치·업데이트와 인증 저장을 검증한다. macOS는 지원 환경 확보 후 검증한다.

완료 기준: 사용자 선택 프로젝트 편집·충돌 처리, 실제 PTY 종료, 실행과 diff 조회가 설치한 앱에서 통과한다.

### 4. 모바일 제어

- [ ] `flownote-mobile`에서 목표 입력·상태·취소·승인·diff 검토를 제공한다.
- [ ] 기존 Remote Android의 실기기 안정성 검증을 이어간다. 통합 계획으로 수용 시험을 면제하지 않는다.
- [ ] 재접속 이벤트 복원·한글 입력·작은 화면·백그라운드 복귀·중복 입력 방지를 확인한다.

완료 기준: 실제 기기에서 실행을 생성·추적·취소하고 승인 결과가 한 번 반영된다. Remote의 기존 기기 등록·지문·PTY 동작은 회귀하지 않는다.

### 5. 운영 품질과 확장

- [ ] 실행 ID별 오류·지연·사용량·예산·정리 결과를 추적한다.
- [ ] 컨텍스트 압축과 도구 결과 크기 제한, 장애 주입·장시간 검증을 보완한다.
- [ ] 기존 timer/큐를 공통 이력과 연결한다. 예약 실행의 중복 방지와 소유자 권한을 검증한다.
- [ ] 노트 검색·장기 메모리는 사용자별 데이터·동의·최소 전달 범위를 먼저 정의한다.
- [ ] 멀티 에이전트는 단일 실행 안정성 검증 이후 별도 계획으로 다룬다.

멀티 에이전트의 의존 조건: 부모·자식 Run, 공유 예산, 취소 전파, 결과 추적, 프로젝트 권한 검사. 이 계획 편입 작업에서 에이전트를 추가 실행하지 않는다.

## 검증·릴리즈

문서 편입은 상대 링크·색인·공백·변경 범위를 검증한다. 아직 없는 패키지의 테스트 명령을 통과했다고 기록하지 않는다.

구현 단계에서는 변경된 프로젝트에 맞게 기존 명령을 적용한다.

| 변경 대상 | 검증 |
| --- | --- |
| 웹 | `cd flownote && yarn verify` 및 새 개발 화면을 포함한 staging E2E |
| Go 도메인 | `cd flownote-serve && go test ./...` |
| 게이트웨이 | `cd flownote-API && uv run pytest` |
| 스키마·인증 | `cd flownote-server && ./gradlew test` 및 staging 마이그레이션 검증 |
| 모바일 | `cd flownote-mobile && yarn verify`와 실제 기기 수용 시험 |
| 자동화 | `automation/codex/tests/run-tests.sh`, `node --test automation/codex/tests/feedback-release.test.mjs`와 워커 계약·장애 시험 |
| Remote | `npm run verify --prefix apps/host`, `npm test --prefix apps/android/terminal` 및 Android/Linux/Windows 통합 시험 |
| 새 코어·데스크톱 | 패키지 선별 이전 시 검증 명령과 CI·릴리즈 계약을 먼저 등록 |

계약 테스트는 사용자별 격리, 승인 위조/재사용/만료, 취소 경합, lease 만료, 이벤트 재생·중복, 소스 변경 후 patch 차단을 포함한다. 실행 계층은 경로 탈출·symlink·secret 파일·네트워크·자원 한도·프로세스 종료를 확인한다.

실행 코드 변경의 배포는 [DEPLOYMENT.md](../../DEPLOYMENT.md)의 staging-first 기준을 따른다. 새 대상이 있으면 배포 컨트롤러·환경 격리·healthcheck·롤백을 먼저 추가한다. 이번 계획 편입에는 실행 산출물 변경이 없으며 클라우드·데스크톱·APK 배포를 수행하지 않는다.

## 의사결정 로그

| 날짜 | 결정 | 근거와 대안 |
| --- | --- | --- |
| 2026-10-14 | IDLE의 제품 계획을 Flownote 개발 작업 공간으로 편입 | 사용자 요청. 독립 제품·독립 로드맵을 계속 운영하는 대신 기존 노트·작업·Remote와 연결 |
| 2026-10-14 | IDLE 코드는 원본으로 보존하고 단계별 선별 이전 | 현재 구현과 Flownote 인증·저장·배포 경계가 다름. 일괄 복사·이름 변경은 하지 않음 |
| 2026-10-14 | 기존 Codex 워커·신뢰 컨트롤러를 첫 실행 경로로 사용 | 이미 snapshot·검증·리뷰·staging-first 정책이 있음. 독립 실행/배포 체계를 중복 도입하지 않음 |
| 2026-10-14 | 클라우드 기준 데이터는 PostgreSQL | 기존 사용자별 서비스·Flyway 소유권을 유지. IDLE SQLite 서버를 그대로 노출하는 대안은 제외 |
| 2026-10-14 | 조회·계약부터 구현하고 데스크톱·모바일을 확장 | 기존 산출물로 실행 모델을 검증한 뒤 파일/프로세스 권한과 클라이언트를 추가 |

## 검증 기록

2026-10-14: IDLE 루프·프로토콜·SQLite 저장소·도구·격리 코드와 Flownote Remote·자동화·문서 기준을 확인했다. 문서 검증 결과는 [편입 보고서](../../../logs/report/2026-10-14-0713-idle-plan-integration.md)에 기록한다. 1~5단계 구현·테스트·배포 완료 근거는 아직 없다.
