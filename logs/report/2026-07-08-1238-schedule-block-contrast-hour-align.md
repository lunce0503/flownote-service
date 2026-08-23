# 일정 블록 가독성 + 시간 눈금 정렬 수정

- 일시: 2026-07-08 12:38 (로컬)
- 브랜치: `design/fsd-refactor` (미커밋)
- 근거: 사용자 스크린샷 `logs/제목 없음.png` — 일별 24h 시간 분배 바에서 ① 밝은 색(노랑·주황) 블록의 흰 글씨가 안 보이고 ② 0h/6h/… 시간 눈금이 그리드 라인과 어긋남.

## 원인

1. **대비**: `DailySchedulePanel.tsx`(24h 바)와 `WeeklyTimetableGrid.tsx`(주간 그리드) 모두 블록 글자색이 `text-white` 하드코딩. 사용자 지정 배경색이 밝으면 읽을 수 없음.
2. **눈금**: 시간 라벨 행이 `grid grid-cols-5 text-center` — 라벨 중심이 10/30/50/70/90% 위치에 놓여, 0/25/50/75/100%에 그려지는 그리드 라인과 구조적으로 어긋남.

## 수정

- `features/schedule/model/scheduleModel.ts`: `getReadableTextColor(backgroundColor)` 신설 — YIQ 밝기(≥150)면 진한 글자(`#1c1917`), 아니면 흰색. 3자리 hex 확장, 비정상 입력은 흰색 폴백.
- `widgets/TaskWidget/DailySchedulePanel.tsx`: 세그먼트 `text-white` 제거 → `color: getReadableTextColor(segment.color)`. 시간 눈금을 절대 배치로 교체 — 각 라벨을 `left: (h/24)*100%`에 두고 중간 라벨은 `translateX(-50%)`, 0h는 좌측 고정, 24h는 `translateX(-100%)`로 라인에 정확히 정렬.
- `widgets/TaskWidget/WeeklyTimetableGrid.tsx`: 블록 글자색 동일 적용 + 시간축 라벨(3시간 간격)을 `translateY(-50%)`로 그리드 라인에 수직 중앙 정렬(0시는 상단 고정).

## 검증·배포

- `yarn build` 통과 (11.1s), `npx tsc -b` 32건 = 기준선(신규 0).
- `REDIS_HOST_PORT=6380 docker compose up -d --build` 전 서비스 기동.
- Vercel production `dpl_GJv2ZrS4SYzvXP9JN9VP4bEDBsg9` READY, https://flownote-react.vercel.app 200.
- Railway 배포 생략 사유: 백엔드 파일 변경 없음(프론트 전용).
