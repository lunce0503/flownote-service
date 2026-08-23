# 그림판 툴바 + 시간표·일정 UI 개선

- 완료일: 2026-07-08
- 범위: `flownote/`(툴바·일정 UI), `flownote-server/`(자정 넘김 허용)
- 상세 보고서: `logs/report/2026-07-08-1116-canvas-toolbar-schedule-ui.md`

## 목표와 성공 기준

- 툴바: 시각 일관성(아이콘 크기·스와치 중복)과 레이아웃(3행 성장 제거) 개선, 기능 추가 없음.
- 일정: 겹침 레인 분리, 자정 넘김 지원(서버 포함), 저장/삭제 피드백, 주간 그리드 뷰.
- 기준선 유지: tsc 32건·FSD 경계 위반 0·build 통과.

## 의사결정 로그

1. **자정 넘김 의미론**: end < start = 다음 날로 이어지는 일정. 시작 요일에 귀속, 총 시간 = (1440−start)+end, start==end 금지. 주간 그리드에서 spill 구간은 다음 요일 컬럼(SUN→MON 순환)에 반투명 표시.
2. **서버 변경 포함(사용자 승인)**: 자정 넘김은 생성 검증·UPDATE SQL WHERE·DB CHECK 3중으로 막혀 있어 프론트 단독 불가. `V21__allow_overnight_schedule_items.sql`로 CHECK를 `start<>end`로 완화. UPDATE WHERE의 `start_time<end_time`은 기존 행 기준 평가라 자정 넘김 행이 PATCH에서 영구 404 나는 함정 — `<>`로 함께 수정.
3. **'관리 툴바' 설정 제거**: 어디서도 읽히지 않는 무동작 토글이라 배선 대신 제거(배선하면 설정 버튼 자신을 숨기는 함정 발생).
4. **라쏘 액션 바 = 플로팅 오버레이**: 툴바 3번째 행 대신 `absolute top-full` 오버레이로 전환해 캔버스 가용 높이를 고정. CanvasLibraryPanel과 같은 `z-40` 계층.
5. **삭제 확인 = 2단계 인라인**: 코드베이스에 `window.confirm` 사용례 없음(CanvasLibraryPanel도 인라인 방식) → `confirmingDeleteId` 상태로 버튼 스왑, 4s 자동 리셋.
6. **레인 배정 = greedy first-fit**: 시작순 정렬 후 종료 시각이 빠른 레인 재사용. 일별 바와 주간 그리드가 `assignLanes` 공유.
7. **주간 그리드 위치**: `widgets/TaskWidget/WeeklyTimetableGrid.tsx`(슬라이스 내부 전용, public API 변경 없음), 레이아웃 수학은 `features/schedule/model/scheduleModel.ts`의 `buildWeeklyChart` — FSD 방향 준수.

## 검증

build 통과 · tsc 32(기준선 동일) · lint 83(96→감소) · gradlew test 성공 · compose 전 서비스 기동 + Flyway V21 적용 · 자정 넘김 POST 201/PATCH 200/start==end 400 계약 검증(로컬 시드 사용자, 정리 완료).

## 잔여 부채

- 일정 UI 수동 스모크(실기기 터치·주간 그리드) 자동화 없음 — E2E 부재는 tech-debt-tracker 기존 항목에 포함.
- 서버 schedule 패키지에 단위 테스트 없음(기존 상태 유지).
