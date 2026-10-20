# AI 가용성·메뉴·오류 응답 정합성 계획

상태: 구현 전. 작성: 2026-10-18.
통합 실행 상태는 [MVP 안정화 실행 계획](../../exec-plan/active/2026-10-18-mvp-stabilization.md)에서 관리한다.

## 문제와 근거

게이트웨이 `/api/capabilities`는 agent disabled/stopped를 반환하지만 웹 매니페스트는 AI 메뉴를 활성화한다. AgentChat은 ask_stream 응답의 HTTP 성공 여부를 확인하기 전에 본문을 읽어 오류 JSON/HTML을 assistant 대화로 저장할 수 있다. 요청 실패와 실제 모델 응답을 구분해야 한다.

## 목표와 영향 범위

기능 사용 가능 여부와 메뉴·홈·직접 URL·전송 버튼의 동작을 맞춘다. `flownote/`의 capability 소비 계층, 헤더·홈·Android/Windows 탐색과 Agent 화면이 영향 대상이다. gateway 응답을 계약 기준으로 삼으며 현재 중지된 AI 서비스를 켜지 않는다.

## 최소 구현

1. 기존 capabilities 조회·캐시 패턴을 확인하고 없으면 작은 공유 조회 계층을 추가한다. 기능 이름별 enabled/scope를 해석하고 로딩·조회 실패·disabled·enabled를 구분한다.
2. disabled 기능은 일반 탐색에서 숨기거나 중지 상태로 표시하고 실행 컨트롤을 비활성화한다. 선택한 정책은 모든 진입점에 일관되게 적용한다.
3. `/agent` 직접 접근 시 중지/확인 실패 안내와 노트·캔버스 등 사용 가능한 다음 경로를 제공한다. backend 확인 전에는 모델 요청을 보내지 않는다.
4. ask_stream은 `response.ok`와 기대한 응답 형식을 검사한 뒤 읽는다. 401/403, 서비스 불가, 일반 실패를 구분해 안내하고 오류 응답을 assistant 메시지로 저장하지 않는다.
5. 요청 취소·실패·화면 이동 시 loading 상태와 reader를 정리한다. 기존 대화와 사용자 입력을 보존한다.
6. enabled 계약도 테스트하여 향후 제공자가 실제 활성화되면 기능을 사용할 수 있게 한다. capability 조회 실패를 영구 비활성으로 저장하지 않는다.

모델 교체·학습, 새로운 AI 제공자, 메뉴 전체 재설계는 제외한다. gateway capability가 배포 구성과 정적으로 묶인 현재 정책은 사실대로 유지하며 불필요한 서버 활성화·배포를 추가하지 않는다.

## 완료 기준과 검증

- disabled 상태의 웹·설치 앱 탐색에 작동 가능한 AI처럼 표시되지 않는다.
- 직접 URL과 capability 조회 실패에서 원인·다음 행동이 보이고 전송 요청이 나가지 않는다.
- HTTP 오류 응답이 메시지 UI나 대화 저장 API에 정상 AI 응답으로 전달되지 않는다.
- enabled 응답의 정상 스트림과 세션 만료·중단이 기존 대화 데이터를 손상하지 않는다.

capability 해석·오류 처리 단위 테스트와 신규 staging E2E를 추가한다. 외부 모델 호출 없이 disabled 및 브라우저 응답 주입으로 오류·enabled 상태를 검증한다. 명령: `cd flownote && yarn verify`, 관련 신규 단위 테스트와 cloud E2E. gateway 변경 시 `cd flownote-API && uv run pytest`.

## 문서·릴리스

`docs/product-specs/web-workspace-ux.md`, `docs/PRODUCT_SENSE.md`와 필요한 클라이언트 사양을 갱신한다. 웹 staging 검증 후 동일 소스 production에 배포한다. AI 서비스 자체 재시작은 이 계획에 포함하지 않는다.
