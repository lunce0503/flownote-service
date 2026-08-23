# flownote FSD 리팩터링 P1–P3 완료

- 일시: 2026-07-07 10:48
- 근거: `report/2026-07-07-0944-flownote-fsd-structure-audit.md` (감사)
- 계획 아티팩트: `docs/exec-plan/completed/2026-07-07-flownote-fsd-refactor.md` (단계·의사결정 로그·가정 상세)
- 잔여 부채: `docs/exec-plan/tech-debt-tracker.md` (8건 등재)
- 영향 범위: `flownote/` 단독. API 계약·백엔드 무변경.

## 요약

| 단계 | 내용 | 규모 |
| --- | --- | --- |
| P1 | `@/` alias + 코드모드 | 81파일 153 import 전환, 교차 레이어 상대경로 0 |
| P1 | Public API + 세그먼트 통일 | index.ts 12개 신설/보강, blog 평면→api/ 세그먼트, 심층 import 소비자 28파일 재배선 |
| P1 | ESLint 경계 강제 | eslint 설치(죽은 config 소생) + `no-restricted-imports` 레이어 규칙, 위반 0 |
| P2 | usePersistence 분할 | 1,618 → 968줄 + 4모듈(직렬화/소켓/로컬초안/자산) |
| P2 | Canvas.tsx 분할 | 1,536 → 1,047줄 (CanvasLibraryPanel + useLassoActions 추출) |
| P2 | CRUD → features | features/task·chat 신설, TaskTable·AgentChat 액션 경유화 |
| P3 | 미아/배럴/케이스 | header→Header/ui, shared/auth→features/auth, sync→shared/lib, 배럴 완성, magic→Magic 등 |

부수 교정: `deleteTaskData.ts`의 default 오명명(`updateTasksData`) → `deleteTasksData`. `handleWheel` 포인터 앵커 줌 재적용(배포된 동작과 일치, 브랜치 간 회귀 방지).

## 검증

- `yarn build` ✅ (각 단계별 실행, 최종 11.6s)
- `npx tsc -b`: **32건 = 사전 기준선 동일** (신규 유발 0 — 중간 발생 3건 즉시 수정)
- `yarn lint` FSD 경계 위반 **0건**
- 구조: 미아 파일 0, 전 슬라이스 index 보유, features 7개(auth·chat·task 신설)
- `REDIS_HOST_PORT=6380 docker compose up -d --build` ✅ 전 서비스(8컨테이너) 기동, `:5173` → 200
- Vercel production: deployment `dpl_9pM9CbZXqw2BZUtgY39WhjEpKbwU` READY, alias https://flownote-react.vercel.app → **200**

## 배포 범위

`flownote/`만 변경 → Vercel production만 배포. Railway(`flownote-api`/`flownote-main`) 생략 — 백엔드 실행 산출물 무변경. docs/ 변경은 gitignore 대상 지식 문서로 배포 산출물 아님.

## 남은 리스크 / 권장 후속

- 런타임 E2E 부재로 캔버스 상호작용(폴더 CRUD·올가미·휠 줌)은 수동 확인 권장 (tech-debt #7).
- 변경은 현재 **미커밋**(docs/harness 작업트리). 커밋 시 `design/ui-ux` 등 프론트 브랜치로 분리 권장 — flownote/는 전 브랜치 동일 커밋이라 checkout 이동 가능.
