# flownote FSD 구조 감사

- 일시: 2026-07-07 09:44
- 대상: `flownote/src` (Vite React SPA)
- 성격: 분석 전용(소스 무수정). FSD(Feature-Sliced Design) 원칙 준수 여부 점검.

## 결론 요약

레이어 골격과 의존 방향은 건전하다. 그러나 **Public API 부재 → 심층 import 만연 → 세그먼트 비일관 → 거대 파일**의 조합이 가독성 문제의 실체다. FSD를 "폴더 이름"으로만 채택했고, FSD가 가독성을 만들어내는 핵심 장치(슬라이스 캡슐화·세그먼트 규약·경계 강제)가 빠져 있다.

## 잘 지켜진 것 ✅

| 항목 | 상태 |
| --- | --- |
| 표준 레이어 6개 (`app/pages/widgets/features/entities/shared`) | ✅ 존재 |
| 상향 import (하위 레이어→상위 레이어) | ✅ **0건** (shared/entities/features/widgets/pages 전수 검사) |
| 동일 레이어 슬라이스 간 교차 import | ✅ entities·features에서 0건 |
| pages 슬라이스 Public API | ✅ 11/11 index 보유 |

의존 방향이 깨끗하므로 리팩터링 기반은 좋다.

## 위반·부족 사항 ❌

### 1. Public API(index.ts) 누락 — 캡슐화 붕괴의 근원
| 레이어 | 누락 슬라이스 |
| --- | --- |
| widgets | `BlogWidget`, `CanvasWidget` (2/8) |
| features | `blog`, `canvas`, `schedule` (3/4 — theme만 보유) |
| entities | `canvas`, `chat`, `social`, `stocks` (4/8) |

### 2. 심층 import 만연 (index 우회)
상위 레이어가 슬라이스 내부 파일을 직접 참조한다. 확인 표본:
- `pages/LoginPage/index.tsx:10` → `entities/users/api/loginUserData`
- `widgets/TaskWidget/TaskTable.tsx:4-7` → `entities/task/api/{get,post,delete,update}TaskData`
- `widgets/AgentWidget/AgentChat.tsx:6-9` → `entities/{task,chat}/api/*`
- `widgets/BlogWidget/BlogList/BlogList.tsx:26` → `features/blog/model/blogListModel`
- `widgets/TaskWidget/DailySchedulePanel.tsx:27` → `features/schedule/model/scheduleModel`

슬라이스 내부 구조를 바꾸면 호출부가 전부 깨진다 → "코드 작성이 어렵다"는 체감의 직접 원인.

### 3. 세그먼트 구조 비일관 — 같은 레이어에 3가지 형태 혼재
| 슬라이스 | 형태 |
| --- | --- |
| `entities/canvas`, `entities/chat` | `api/` + `model/` (표준) |
| `entities/schedule` | `api.ts` 단일 파일 + `model/` |
| `entities/stocks` | `api.ts` 단일 파일만 |
| `entities/blog` | 세그먼트 없이 루트에 `getNoteData.ts`, `postNoteData.ts`, `noteDataActions.ts`… 평면 배치 |

어디에 무엇이 있는지 슬라이스마다 규칙이 달라 탐색 비용이 커진다.

### 4. features 빈약 + widgets가 features 역할 수행
- features는 4개(blog/canvas/schedule/theme)뿐. 반면 위젯이 CRUD를 직접 소유:
  `TaskTable`이 task api 4종을 직접 import·호출, `AgentChat`이 chat/task api 직접 호출.
- FSD에서 widgets는 **조합(composition) 레이어**이고 사용자 액션·mutation은 features 소관. 현재는 "UI+데이터+액션"이 위젯 한 덩어리에 있어 재사용·테스트가 어렵다.

### 5. 거대 파일 (가독성 최대 병목)
| 파일 | 라인 |
| --- | --- |
| `features/canvas/model/usePersistence.tsx` | **1,618** |
| `widgets/CanvasWidget/InfiniteCanvas/ui/Canvas.tsx` | **1,536** |
| `widgets/StockWidget/StockDashboard.tsx` | 651 |
| `widgets/BlogWidget/BlockNote/BlockNote.tsx` | 574 |

Canvas.tsx 하나에 포인터/휠/터치 핸들러, 소켓 스트리밍, 문서 목록 UI, 렌더링이 공존한다.

### 6. 미아·중복 파일
- `widgets/header.tsx`(12KB **실구현**) + `widgets/Header/index.ts`는 `../header` 재수출 셔임 — 슬라이스 폴더 규칙 밖의 낱장 파일이 진짜 구현.
- `shared/sync.ts` — 세그먼트 없는 루트 낱장.
- `app/routers/Home.tsx` — 폴더 슬라이스들 사이 낱장. `magic/`(소문자) vs PascalCase 혼재, `LolBanPick` vs `pages/LolBanpick` 케이스 불일치.

### 7. shared에 비즈니스 로직
`shared/auth/`(AuthContext, ProtectedRoute)는 인증 도메인 지식을 포함한다. FSD에서 shared는 **비즈니스 무관** 코드만 허용 — 관례상 `entities/session`(상태) + `features/auth`(로그인 액션) 소속.

### 8. path alias 부재
tsconfig `paths`·vite `alias` 없음. `../../../` 이상 상대경로 **84건**. 파일 이동 시 경로 전부 수선해야 하고, import만 봐서는 레이어를 알 수 없다.

### 9. 배럴 불완전·혼용
- `pages/index.ts`: 11개 중 8개만 export (`SettingsPage`, `StockPage`, `StockChartPage` 누락)
- `widgets/index.ts`: `StockWidget` 누락
- 배럴과 직접 import가 혼용되어 "어느 쪽이 정답인지" 규칙이 없다.

## 우선순위 권고 (수정은 별도 승인 후)

| 순위 | 조치 | 효과/비고 |
| --- | --- | --- |
| P1 | **path alias 도입** (`@/shared` 등, tsconfig+vite) | 저위험·즉효. 상대경로 84건 해소 |
| P1 | **entities 세그먼트 통일** (`api/`+`model/`) + 전 슬라이스 `index.ts` Public API | 탐색 규칙 단일화 |
| P1 | **ESLint 경계 강제** (`eslint-plugin-boundaries` 또는 `@feature-sliced/eslint-config`) | 재발 방지 — 규칙은 도구로 지켜야 유지됨 |
| P2 | `usePersistence.tsx`/`Canvas.tsx` 분할 (소켓·저장·뷰포트·입력 훅 분리) | 가독성 최대 병목 해소 |
| P2 | widgets의 CRUD/mutation을 features로 이동 (task, chat 우선) | 레이어 책임 정상화 |
| P3 | `header.tsx`→`Header/ui/`로 이관, `shared/auth`→`features/auth`+`entities/session`, `shared/sync.ts` 재배치 | 미아 정리 |
| P3 | 배럴 완성, `app/routers` 케이스 통일 | 일관성 |

## 검증 방법 메모

- 상향 import: `grep -rE "from ['\"].*(상위레이어)/" <하위레이어>` 전수 — 0건.
- 심층 import: `grep -rE "/(entities|features)/[a-z]+/(model|ui|api|lib)/" pages widgets app` — 12건+ 표본 확보.
- 파일 크기: `find src -name '*.ts*' | xargs wc -l | sort -rn`.

분석 전용 작업으로 소스 무수정 — Docker 빌드·클라우드 배포 생략(report/ 전용 규칙).
