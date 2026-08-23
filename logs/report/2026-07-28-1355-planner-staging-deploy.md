# 플래너(/planner) 통합 — 스테이징 배포

작성 2026-07-28 13:55 UTC. 브랜치 `worktree-planner-integration`(커밋 `f356e19`), draft PR #2.

## 배포 대상

프론트 전용 변경이라 Vercel만 배포했다. 백엔드(flownote-serve/gateway/Spring)는 산출물 변화가 없어 Railway 배포 생략.

| 대상 | 결과 |
| --- | --- |
| Vercel `flownote-react-staging` | READY · https://flownote-react-staging.vercel.app · asset `index-AHCBzcz2.js` |
| 프로덕션(`flownote-react`) | **미배포**(요청 범위: 스테이징만) |

워크트리에는 Vercel 링크가 없어 `vercel link --project flownote-react-staging` 후 배포했다(`.vercel`은 gitignore 대상이라 커밋에 영향 없음).

## 검증

**라우트/번들**
- `/` 200, `/planner` 200
- 번들 포함 확인: `플래너`(9), `/planner`(6), `오늘의 시간표`(1), `주간 일정`(2), `캘린더 내보내기`(1), `BEGIN:VCALENDAR`(1, ICS 직렬화), `작업 요약`(1)
- 제거된 화면 잔여 없음: `전체 작업 보기`(0)

**플래너 의존 API**(게스트 계정 + 스테이징 Origin)
- `/api/diary` 200 · `/api/schedule-items` 200 · `/api/tasks` 200 · `/api/diary/dates` 200

**콜드스타트 관찰**: 첫 로그인 요청이 실패한 뒤 재시도에서 200이었다. 스테이징 `flownote-main`이 App Sleeping이라 첫 요청이 깨우는 동안 실패하는 알려진 동작이며, 프론트의 게스트 자동 로그인은 이미 5xx 재시도(최대 4회·1.5s 간격)를 갖고 있어 사용자 화면에서는 자동 복구된다.

## 빌드 검증(배포 전)

- `yarn build` 통과
- 신규/수정 파일 `eslint` 클린, FSD 위반 0
- `tsc` 32건 = 기준선 동일(신규 타입 오류 없음), 전체 lint 79건(기준선 84건에서 감소)
- Docker 통합 빌드 **생략**: 워크트리에서 compose를 올리면 `container_name`이 실행 중인 로컬 스택과 충돌해 사용자 컨테이너를 건드린다. 이번 변경은 프론트 전용이라 백엔드 산출물 변화 없음.

## 확인 방법

https://flownote-react-staging.vercel.app 접속 시 게스트로 자동 로그인되며, 상단 내비 **플래너**(또는 `/planner`)에서:
1. **일간** — 할일 추가 후 색 선택 → 시간표 칸 칠하기, 펜 도구로 필기(되돌리기/전체 지움), 하단 저널 작성
2. **주간** — 요일별 반복 일정 추가 → 일간 시간표에 투명하게 겹쳐 보이는지 확인
3. **월간** — 일정/일기/마감 표시 확인, `캘린더 내보내기`로 .ics 저장 후 휴대폰 캘린더 가져오기 테스트

## 다음 단계

- 스테이징 확인 후 프로덕션 배포 가능(프론트 전용, `flownote-react`).
- PR #2는 draft 상태이며 병합은 미실행.
