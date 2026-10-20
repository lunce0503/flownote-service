# 플래너 동시 편집·일정 추가 충돌 방지 계획

상태: 구현 전. 작성: 2026-10-18.
통합 실행 상태는 [MVP 안정화 실행 계획](../../exec-plan/active/2026-10-18-mvp-stabilization.md)에서 관리한다.

## 문제와 근거

`flownote-serve/internal/diary/diary.go`의 Save는 날짜별 todos/grid/journal을 조건 없이 통째로 덮어쓴다. `CanvasPlannerSuggestions.tsx`도 GET 뒤 전체 PUT을 수행한다. 두 화면이 같은 날짜를 읽은 뒤 순서대로 저장하면 먼저 저장된 변경이 사라질 수 있다. 현재 요청에는 기준 버전이 없다.

## 목표와 영향 범위

오래된 화면의 저장은 최신 일기·시간표·할 일을 덮어쓰지 않고 충돌로 종료해야 한다. Spring Flyway, Go diary 저장소·핸들러, 웹 diary API·`useDiary`·플래너·캔버스 제안, gateway 계약 검증과 cloud E2E가 영향 대상이다. 저장 호출부를 웹·모바일·자동화까지 검색해 누락 없이 이행한다.

## 최소 계약

- 날짜별 문서에 단조 증가 `revision`을 추가한다. 기존 행 초기화는 Flyway가 소유하며 새 문서의 기준 버전은 0으로 정의한다.
- GET과 성공 응답에 revision을 반환하고, PUT은 읽었던 `expected_revision`을 전달한다. 서버의 조건부 UPDATE/INSERT로 비교와 갱신을 원자적으로 처리한다.
- 버전 불일치는 HTTP 409와 안정적인 오류 코드로 반환한다. 요청 전체를 적용하지 않는다. 같은 사용자·날짜의 최초 동시 생성도 한쪽만 성공해야 한다.
- revision 누락을 무조건 덮어쓰기로 해석하지 않는다. 미갱신 클라이언트는 명시적인 갱신 필요 오류로 실패시킨다. 오류 코드·응답 형태는 API 계약 문서와 테스트에서 고정한다.
- 순서가 중요한 서버 migration/GET revision 추가 → 호환 클라이언트 → 쓰기 검증 활성화의 배포 단계를 구현 시 고정한다. 중간 단계에서 최신 웹의 저장이 깨지지 않도록 한다. 임시 호환 분기가 필요하면 범위·제거 조건을 기록한다.
- 응답 유실 후 같은 요청 재전송을 위해 요청 ID 기반 중복 방지 또는 저장 결과 재확인 규칙을 정의한다. 무조건 재시도는 금지한다.

## UI와 캔버스 제안

- 충돌 시 로컬 변경을 보존하고 서버 갱신 사실을 안내한다. 사용자가 재조회·비교·다시 적용할 수 있어야 하며 조용한 자동 덮어쓰기를 하지 않는다.
- 캔버스 일정 추가는 서버의 원자적 추가 API 또는 revision을 전달하는 제한적 재조회/재검증으로 처리한다. 겹침 검사와 기존 journal/todos/grid 보존을 같은 버전 기준으로 검증한다.
- 두 기기의 겹치지 않는 수정도 자동 병합이 구현되지 않았다면 충돌로 처리한다. 무제한 자동 병합·재시도는 이번 범위에서 제외한다.
- 날짜를 바꾼 뒤 이전 저장 응답이 새 날짜 상태를 바꾸지 않도록 기존 저장 큐를 점검한다.

## 완료 기준과 검증

1. 같은 revision을 읽은 두 요청 중 첫 저장만 성공하고 두 번째는 409다. DB에 첫 저장 내용이 남는다.
2. 문서가 없을 때 동시 생성해도 중복·덮어쓰기가 없다.
3. 캔버스 일정 추가와 플래너 저장 경합에서 기존 일기·시간표가 사라지지 않는다.
4. 충돌·네트워크 실패 뒤 로컬 입력과 재시도 대상이 보존된다. 같은 요청의 재확인이 중복 일정을 만들지 않는다.
5. 타 사용자 문서·날짜 접근 권한과 레거시 격자 변환은 유지된다.

명령: `cd flownote-serve && go test ./...`, `cd flownote-server && ./gradlew test`, `cd flownote && yarn verify`. gateway가 바뀌면 `cd flownote-API && uv run pytest`도 실행한다. 실제 staging PostgreSQL에서 두 클라이언트의 경합을 검증하는 신규 cloud E2E를 추가한다. production 데이터를 시험하지 않는다.

## 문서·릴리스

`docs/product-specs/planner-daily-timetable.md`, `canvas-planner-suggestions.md`, `docs/generated/db-schema.md` 및 API 계약을 구현과 함께 갱신한다. 새 Flyway 버전은 구현 시작 시 실제 최대 버전을 확인한다. staging에서 migration·충돌·이전 클라이언트 실패 안내를 검증한 같은 소스만 production에 배포한다. 데이터 손실을 유발하는 DB rollback은 하지 않는다.
