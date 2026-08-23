# flownote FSD 구조 리팩터링 (P1–P3)

- 상태: **완료** (2026-07-07)
- 근거 감사: `report/2026-07-07-0944-flownote-fsd-structure-audit.md`
- 영향 범위: `flownote/` 단독 (Vite SPA). API 계약·DB·백엔드 무변경. 배포 대상: Vercel `flownote-react`.

## 목표와 성공 기준

FSD(Feature-Sliced Design)를 "폴더 이름"이 아니라 실효 규칙으로 만든다.

- [x] 교차 레이어 import는 `@/` 절대경로, 상향 import 0건 유지
- [x] 모든 슬라이스가 Public API(index.ts) 보유, 상위 레이어의 심층 import 0건
- [x] 규칙을 ESLint로 기계 강제 (재발 방지)
- [x] 1,500줄+ 거대 파일 2개 분할
- [x] 위젯의 CRUD 액션이 features를 경유
- [x] 미아 파일·배럴 누락·케이스 비일관 해소
- [x] 검증: `yarn build` 통과, `tsc` 오류 기준선(32) 비악화, 경계 위반 0

## 실행 단계와 결과

### P1 — 규칙 기반 구축
1. **path alias**: `tsconfig.app.json` paths + `vite.config.ts` resolve.alias에 `@/ → src/`. 코드모드로 **81개 파일 153개 교차 레이어 상대 import**를 `@/`로 전환.
2. **Public API + 세그먼트 통일**: index.ts 신설 — entities(canvas·chat·social·stocks·schedule api 보강), features(blog·canvas·schedule), widgets(BlogWidget·CanvasWidget). `entities/blog` 평면 파일 5개를 `api/` 세그먼트로 `git mv`. 상위 레이어 심층 import **28개 파일** 재배선.
3. **ESLint 경계**: eslint 미설치 상태(죽은 config)였음 → eslint 계열 devDeps 설치, `lint` 스크립트 추가. `no-restricted-imports`로 레이어별 상향 import(alias+상대경로 우회 모두)·동일 레이어 교차 슬라이스·심층 import 금지. 추가 플러그인 불필요.

### P2 — 거대 파일 분할·책임 재배치
4. **usePersistence.tsx 1,618 → 968줄 + 4모듈**: `canvasPersistenceModel.ts`(직렬화·정규화·상태마커, 161줄) / `canvasSocketClient.ts`(소켓 싱글턴·emit·save, 154줄) / `canvasLocalDraft.ts`(로컬 초안·재시도 큐·worker, 222줄) / `canvasAssetApi.ts`(업로드·이미지 로드·hydrate, 178줄). 코드 블록 원문 이동, 모듈 경계에서만 export/import 추가.
5. **Canvas.tsx 1,536 → 1,047줄**: `ui/CanvasLibraryPanel.tsx`(문서/폴더 사이드바 + CRUD + 편집 상태 소유) / `model/useLassoActions.ts`(올가미 이동·확대·복사·붙여넣기·색·삭제 + 클립보드 상태) 추출.
6. **widgets CRUD → features**: `features/task`·`features/chat` 신설(model 세그먼트). TaskTable·AgentChat의 **함수 import**를 features 경유로 전환. 타입 import는 entities 유지(FSD 허용).

### P3 — 정리
7. `widgets/header.tsx`(실구현 미아) → `widgets/Header/ui/Header.tsx`. `shared/auth`(비즈니스 로직) → `features/auth`(model/AuthContext + ui/ProtectedRoute), 소비자 6곳 재배선. `shared/sync.ts` → `shared/lib/sync.ts`. 배럴 완성(pages 3종·StockWidget). `app/routers` 케이스 통일(magic→Magic, LolBanPick→LolBanpick, Home.tsx→Home/route.tsx).

## 의사결정 로그

| 결정 | 근거 | 기각한 대안 |
| --- | --- | --- |
| 경계 강제를 `no-restricted-imports`로 | 신규 플러그인 0개로 상향·심층·교차 슬라이스 모두 커버 | `eslint-plugin-boundaries`(의존성 추가 대비 이득 낮음) |
| 슬라이스 내부는 상대경로 유지, 교차 레이어만 `@/` | FSD 관례. import만 봐도 경계 넘는지 식별 가능 | 전체 절대경로화(내부 이동성 저하) |
| features/task·chat은 얇은 액션 모듈로 시작 | 레이어 방향을 먼저 확립, 로직은 점진 축적 | 위젯 상태 로직까지 훅으로 이관(고위험, 검증 수단 부족) |
| 타입 import는 entities 직결 허용 | FSD에서 entity 타입은 공용 계약 | 타입까지 features 경유(불필요한 간접화) |
| deleteTaskData.ts의 default `updateTasksData`를 `deleteTasksData`로 교정 | 복붙 오명명. Public API 명명 시점이 유일한 저비용 교정 기회 | 방치(혼란 지속) |
| 분할은 코드 원문 이동 + 경계 export만 | 동작 무변경 보장, `tsc` 기준선 비교로 검증 | 분할 겸 리라이트(회귀 위험) |
| handleWheel 포인터 앵커 줌 재적용 | `feat/agent-note` 브랜치에 커밋·프로덕션 배포된 동작. 이 브랜치 작업트리에 없어서 방치 시 배포 회귀 | 생략(머지 시 줌 수정 유실 위험) |

## 검증 결과

- `yarn build` ✅ (11–12s, 각 단계마다 실행)
- `npx tsc -b`: 오류 32건 = **사전 기준선과 동일** (분할 유발 오류 3건 발생 즉시 수정 완료. 32건은 기존 부채 → tech-debt-tracker)
- `npx eslint src` FSD 경계 규칙 위반 **0건** (기존 일반 lint 이슈 96건은 기존 부채)
- `docker compose up -d --build` + Vercel prod: 본 문서와 같은 변경 범위의 report 참조

## 가정과 제외 범위

- 런타임 E2E(캔버스 드로잉·소켓 협업)는 자동화 수단이 없어 빌드+타입 동등성으로 갈음. 수동 확인 권장 지점: 캔버스 폴더 CRUD, 올가미 복사/붙여넣기, 휠 줌.
- Canvas.tsx의 포인터 핸들러(약 200줄)는 스트리밍 refs와 강결합이라 이번에 분할하지 않음 → tech-debt.
- 기존 lint 96건·tsc 32건은 이 리팩터링 범위 밖 → tech-debt-tracker에 등재.
