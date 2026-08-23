# 일기장(diary) 기능 추가 — 스테이징 배포

작성 2026-07-23 13:47 UTC. 브랜치 `feat/diary`. 백엔드·프론트 모두 **스테이징에만** 배포.

## 기능

하루 단위 "일기장":
- **펜슬 시간표 캔버스**: `startHour~endHour`(기본 06:00–24:00)를 행(시간), 한 시간을 `cols`칸(기본 6 = 10분 단위)으로 나눈 그리드를 canvas로 그리고, 펜/지우개로 칸을 칠한다.
- **색 지정 할일**: 할일마다 사용자가 색을 지정(색상 선택기 + 프리셋 팔레트). 선택한 할일 색이 펜 색이 되어 그 색으로 시간표 칸을 채운다 → "오늘의 시간표를 색으로 채워나가는" 방식. 할일은 완료 토글로 "할 일 / 완료한 일"로 구분.
- **BlockNote 저널**: "오늘 있었던 일"을 자유 타이핑으로 기록.
- 날짜 네비게이션(이전/다음/오늘 + 날짜 선택), 800ms 디바운스 자동 저장, loading/error/saved 상태 명시.

## 아키텍처 / 구현

**백엔드 (flownote-serve, Go)** — 신규 `diary` 도메인(`internal/diary/diary.go`), task.go 패턴 이식:
- `GET /api/diary?date=YYYY-MM-DD` — 해당 날짜 일기(없으면 빈 일기 200)
- `PUT /api/diary/{date}` — `(user_id, entry_date)` upsert
- `GET /api/diary/dates` — 일기 존재 날짜 목록
- 저장 필드: `todos`/`grid`/`journal`을 **jsonb로 불투명 저장**(형태는 프론트가 정의, snake_case 상위 키). 날짜 형식 검증(400).
- **스키마 부트스트랩**: flownote-serve엔 마이그레이션 러너가 없어, 시작 시 `diary.EnsureSchema`가 `CREATE TABLE IF NOT EXISTS diary_entries(...)`로 idempotent 생성(`main.go`). *(마이그레이션 도구 부재로 택한 자체 생성 방식 — 향후 마이그레이션 인프라 도입 시 이관 후보.)*
- **게이트웨이**(`flownote-API/app/gateway.py`): `_SERVE_PREFIXES`에 `"diary"` 추가 → `/api/diary/**`가 flownote-serve로 라우팅.

**프론트 (FSD)**:
- `entities/diary` — 타입(DiaryTodo/DiaryGrid/DiaryEntry) + API(getDiary/putDiary/getDiaryDates) + 그리드 정규화.
- `features/diary/useDiary` — 로드/디바운스 저장/할일·그리드·저널 상태·도구·활성 색 오케스트레이션. 로드-시 setState가 저장을 유발하지 않도록 저장은 액션에서 직접 스케줄.
- `widgets/DiaryWidget` — `DiaryTimetableCanvas`(canvas 그리드 painting, dpr 대응, ResizeObserver 반응형), `DiaryTodoPanel`(색 지정·펜/지우개·완료), `DiaryJournal`(BlockNote, 날짜 key로 remount), `index.tsx`(조합·날짜 네비·저장 표시).
- `pages/DiaryPage` + `app/routers/Diary` + `capabilityManifest`에 `diary` 역량(`/diary`, nav, protected) 등록.

## 검증

- flownote-serve: **Docker Go 빌드 성공**(로컬 go 툴체인 부재 → 이미지 빌드로 컴파일 확인).
- 프론트: `yarn build` ✓, diary 파일 `tsc` 타입 오류 0, `eslint` 0.
- **staging diary API end-to-end 실증**(회원가입→로그인→diary):
  1. 빈 일기 GET → 200 `{entry_date, todos:[], grid:{}, journal:[]}`
  2. PUT 저장 → 200 (todos 2, cells 3, journal 1)
  3. GET 재조회 → cells `{"0":"t1","1":"t1","7":"t2"}`, todo 색 `#3b82f6`, 저널 텍스트 영속
  4. PUT 재칠(cells 4) → upsert 성공
  5. GET /api/diary/dates → `["2026-07-22"]`
  6. 잘못된 날짜 → 400 검증
- staging 프론트 번들에 `일기장`·`/diary`·`/api/diary`·`오늘의 시간표` 포함, `/diary` 라우트 200.
- `REDIS_HOST_PORT=6380 docker compose up -d --build` **성공(exit 0)**, serve(diary 포함)·api·react·spring·canvas 기동. `ai-server`만 `uvicorn: not found`로 재시작 — **diary 무관 사전 존재 로컬 이슈**(flownote-ai 미변경).

## 배포 (스테이징 전용)

| 대상 | 배포 |
| --- | --- |
| flownote-serve (Railway staging) | `railway up ./flownote-serve -e staging` — 스키마 자동 생성 |
| flownote-api 게이트웨이 (Railway staging) | `railway up ./flownote-API -e staging` — diary 프리픽스 |
| flownote-react-staging (Vercel) | `vercel --prod`(재링크 후 원복) → https://flownote-react-staging.vercel.app/diary |

프로덕션(Railway production / flownote-react) 및 main 브랜치 병합은 **수행하지 않음**(요청대로 스테이징 한정). `feat/diary` 커밋 `a33e3b1`, `flownote/.vercel` 링크는 프로덕션으로 원복.

## 후속 여지

- 그리드 시간 범위/칸 수를 사용자 설정으로 노출(현재 06–24, 10분 고정).
- 날짜 목록(`/api/diary/dates`)을 캘린더/히트맵 UI로 노출.
- 스키마를 마이그레이션 인프라로 이관(현재 Go 시작 시 자체 생성).
