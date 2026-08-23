# 그림판 툴바 + 시간표·일정 UI 개선 (Workstream A/B)

- 일시: 2026-07-08 11:16 (로컬)
- 브랜치: `design/fsd-refactor` 작업 트리 (미커밋)
- 계획: `~/.claude/plans/tingly-singing-mccarthy.md` (사용자 승인). 구현은 두 포크 에이전트가 병렬 수행, 통합 검증·배포는 부모 세션 담당.

## Workstream A — 그림판 툴바 (기능 추가 없음, 시각·레이아웃만)

- `flownote/src/widgets/CanvasWidget/InfiniteCanvas/ui/Toolbar.tsx`
  - `TOOLBAR_ICON_SIZE = 18`로 원형 아이콘 버튼 크기 통일 (ImagePlus/Download/Upload/Settings 19→18). 저장 상태 필 14·장식 Palette 16은 의도적 예외로 주석.
  - `ColorSwatchButton`·`PenColorPill` 추출 — 펜/라쏘 색상 행의 중복 마크업 통합, 라쏘 스와치도 동일한 원형+링 시각. 라쏘는 토글이 아니라 액션이므로 `aria-pressed` 미적용.
  - lg 이상에서 펜 색상 필이 첫 줄 합류(한 줄 툴바), 미만은 기존 두 줄. 우측 저장/설정 클러스터 `sticky right-0`로 모바일 스크롤 시 고정, 줌·좌표 필 `hidden sm:flex`.
  - 라쏘 액션 바를 3번째 행 대신 `absolute top-full z-40` 플로팅 오버레이로 — 캔버스 영역을 더 이상 밀지 않음.
  - 제목 필 `max-w-[128px] sm:max-w-[220px] xl:max-w-xs` 반응형 truncate.
- `ui/Canvas.tsx` + `features/canvas/model/canvasConstants.ts`: 어디서도 읽히지 않던 무동작 '관리 툴바' 토글(상태·토글·체크박스·localStorage 키) 제거.

## Workstream B — 시간표·일정

자정 넘김 의미론: 종료 < 시작이면 다음 날로 이어지는 일정, 시작 요일 귀속, 총 시간 = (1440−start)+end, start==end 금지.

- **서버** (`flownote-server/`): 신규 `V21__allow_overnight_schedule_items.sql`(CHECK `start<end` → `start<>end`), `ScheduleService.validate()` start==end만 거부, `update()` WHERE `start_time<end_time` → `<>` (자정 넘김 행 PATCH 영구 404 차단).
- **모델** (`features/schedule/model/scheduleModel.ts`): `getItemDuration` 자정 넘김 계산, `isOvernightItem`, `assignLanes`(greedy 레인), `buildRoutineChart` 개편(2분할·레인·`laneCount`·`showLabel`·최소너비 1.25%·아이템 기준 totals), `buildWeeklyChart` 신설(spill은 다음 요일, SUN→MON 순환), `SCHEDULE_WEEKLY_VIEW_STORAGE_KEY`.
- **패널** (`widgets/TaskWidget/DailySchedulePanel.tsx`): 요일 선택 `grid-cols-7` 고정, 24h 바 레인별 세로 확장·짧은 일정 라벨 숨김+툴팁, 성공/오류 notice(2.5s 자동 소거, aria-live)+폼 인라인 검증 오류, 2단계 인라인 삭제 확인(4s 리셋), "(다음 날)" 표기, 일별/주간 토글(localStorage).
- **주간 그리드** (`widgets/TaskWidget/WeeklyTimetableGrid.tsx` 신규): 시간축 sticky + 7컬럼(시간당 24px), 레인 가로 분할, spill opacity-70, 30분 미만 라벨 숨김, 오늘 컬럼 amber, 블록 클릭 → 카드 scrollIntoView + amber 링 2s.

## 검증

| 항목 | 결과 |
| --- | --- |
| `yarn build` (flownote/) | 통과 (10.9s) |
| `npx tsc -b` | 32건 = 사전 기준선, 신규 0 |
| `yarn lint` | 83건 (기준선 96 대비 감소), FSD 경계 위반 0 |
| `./gradlew test` (flownote-server/) | BUILD SUCCESSFUL (포크 실행) |
| `REDIS_HOST_PORT=6380 docker compose up -d --build` | 전 서비스 기동, Flyway "Migrating schema to version 21 - allow overnight schedule items" 적용, `/actuator/health` UP |
| 계약 검증 (로컬, 임시 시드 사용자→정리 완료) | 자정 넘김 POST **201** · 동일 항목 PATCH **200**(UPDATE WHERE 회귀 확인) · start==end POST **400** · DELETE 200 |

## 배포

- Railway `flownote-main`: deployment `153bca2d-6078-4abe-8d80-ad66814bf44e` **SUCCESS**. 프로덕션 로그에서 Flyway "now at version v21" 확인, `/actuator/health` UP. (참고: 프로덕션 PostgreSQL 18.4가 현 Flyway 검증 범위보다 신버전이라는 WARN 존재 — 동작 영향 없음, 추후 Flyway 업그레이드 후보.)
- Vercel `flownote-react` production: `dpl_BPoNfD7J6kUmbjfYdHsdBumcE9Ds` READY, https://flownote-react.vercel.app 200.
- `flownote-api`(FastAPI) 배포 생략: 이번 변경에 FastAPI 파일 없음.

## 남은 사항

- 수동 UI 스모크(실기기 터치, lg 한 줄 툴바, 주간 그리드 SUN→MON spill)는 자동화 불가로 사용자 확인 권장.
- 변경 전체가 미커밋 상태 — 커밋/브랜치 배치는 사용자 결정 대기.
