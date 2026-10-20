# Blog Markdown 작업 공간 구현 후보

작성: 2026-10-19 14:13 (로컬 UTC, 결과 작성 시작). source_commit: `21d2d9441c5338cbd2c9cd7394fd580715b1faaf`. 상태: **구현 후보, 신뢰 환경 검증/채택 필요**. deployment_performed=false.

## 결과

공유 Canvas 스타일 작업 공간, 실제 category/folder/note 탐색기, 파일 생성·이름·이동·삭제, Markdown 원문·버전 저장·지연 미리보기·.md 내보내기를 구현했다. legacy는 열기만으로 쓰지 않으며 원본 JSON 보기/다운로드와 서버가 관리하는 무손실 backup을 유지한다. 구형 배열 overwrite, 다른 입력의 오래된 ack, 전환 경합을 서버 형식/revision 조건으로 막는다. IndexedDB 초안·atomic ack/rebase·명시적 복구/충돌·기기 저장 실패 안내를 추가했다.

기본 full GET은 보존하고 summary/detail을 추가했다. summary SQL에는 body/object-key가 없고, detail은 소유권 확인 후 대상 body만 해석한다. 기본 full-list의 N+1은 구 소비자 호환 경로로 남는다. 웹 Agent·native·MCP의 Markdown 읽기/쓰기와 기존 전체 목록 소비를 처리했다. 스키마는 기존 JSONB format 표식을 이용하며 최신 Flyway **V21**, 새 migration 없음이다. API 먼저/클라이언트 후 rollout과 보호 없는 서버 rollback 금지를 [코드맵](../../docs/design-docs/blog/blog.md)에 명시했다.

인증 변경은 노트 초안의 logout 확인/사용자별 정리에 한정했다. HttpOnly/Origin/헤더·세션 폐기 구현과 기존 auth 테스트는 유지했다. Canvas/PDF/planner 소스·의존성/lockfile·배포/자동화 도구는 변경하지 않았다. 웹 bundler의 잘못된 React package 분기는 노트 초기 import 문제를 수정하기 위해 좁게 변경했다. 이전 후보 patch 전체를 적용하지 않았다.

## 재현과 성능 근거

변경 전 Go의 순차 N+1은 코드에서 확인했다. 제공된 staging 합성 baseline(노트/Canvas 각 5개·목록 5회 교대)은 notes median **954ms / 33,348 bytes**, Canvas **201ms / 770 bytes**다. API 목록 값이며 browser 전체/production 값이 아니다. 첫 계정 POST 502 이후 warm 실행이 성공했으며 최초 장애·bootstrap 지연 원인은 미확정이다.

추가한 bundle 테스트는 실제 후보 산출물에서 `vendor-react → editor-blocknote/prosemirror/yjs`로 먼저 실패했다. `/react/`가 `@blocknote/react`를 포함하는 분기를 package-root로 한정하고 explicit chunks로 수정한 뒤 앱/Blog 정적 import 그래프에 BlockNote/preview/KaTeX가 포함되지 않는 검사에 통과했다. 초기 편집기 청크 문제는 이제 정적 근거가 있으며 browser 시간 근거는 없다.

**사후 API·브라우저 성능 수치는 pending**이다. 새 staging spec은 warm 합성 5회 교대 API 시간을 body 완료까지 측정하고 payload와 조건만 첨부하도록 작성했다. cold/warm TTFB·요청 수·사용 가능 시점·실제 다운로드는 신뢰 staging에서 추가 측정해야 한다. 개선 백분율이나 Canvas와 같은 속도를 달성했다는 주장은 하지 않는다.

## 실제 검증

| 명령/대상 | 결과 |
| --- | --- |
| `cd flownote && yarn verify` | 실패. 기본 Vite config bundler가 read-only node_modules/.vite-temp에 쓰려다 EROFS. lint/typecheck 이후 build config 로드에서 중단. |
| `cd flownote && yarn verify --configLoader runner` | 최종 소스 lint + TypeScript + production build 통과. 의존성/스크립트 변경 없이 같은 config 로더만 명시했다. 기존 pdf.js eval 경고는 남음. |
| `node <각 .test.mjs>` (활성 계획의 파일/명령 참조) | 새 Blog 순수 20개 + native note-content 1개 + 기존 preferences/PDF/planner/pan 20개, **41개 통과**. |
| `cd flownote && node tests/blog-bundle.test.mjs` | production 정적 import 경계 **1개 통과**, 총 로컬 Node 행동/경계 테스트 **42개**. |
| `cd flownote && yarn playwright test e2e-cloud/blog-markdown-workspace.spec.ts e2e-cloud/android-app.spec.ts --list` | 15개 수집 성공. 새 Blog staging 12개·Android 3개. 실제 browser 실행 결과가 아니다. |
| Go notes tests | storage 0/대상 1회, cursor·오류·기본 목록·형식/원본·구 client·idempotence·인증 HTTP **11개 작성**, 실행 대기. |
| native 전체/Python·Java·Flyway | 미실행. web 외 frozen 의존성·Go/Java/Python/uv/Flyway 실행 도구 없음. 작은 native converter 테스트만 로컬 실행. |
| cloud·기기·원본 채택·배포 | 사용자 경계에 따라 미실행. 실제 계정·production 데이터·외부 앱·로컬 앱 서버·Compose에 접근하지 않음. |

Android의 의도적으로 바뀐 Markdown editor assertion만 좁게 수정했다. 열기 후 legacy 원본/revision, 명시적 전환 후 backup·saved source·재로드·bold preview를 확인한다. unrelated/auth 테스트를 skip/삭제/약화하지 않았다. Go tests를 실행한 것으로 표시하지 않는다.

## 후속 조치

[활성 실행 계획](../../docs/exec-plan/completed/2026-10-19-blog-markdown-workspace.md)의 정확한 Go/gofmt·Flyway info/validate·native/MCP·기존 전체 cloud 회귀 명령을 신뢰 환경에서 실행한다. legacy full-list와 새 summary/detail의 호환, 실 DB format/revision 경합, HttpOnly/계정 전환, IME/빠른 이동·quota·모바일 focus·390/820/1440px를 staging에서 확인한다.

이 실행에서 배포하지 않은 이유는 사용자가 snapshot 내 구현만 승인하고 commit/push/PR/배포·자원 provision을 명시적으로 금지했기 때문이다. 채택 후 필요한 staging-first entry는 `node scripts/deploy-cloud.mjs release <target>`이다. 영향 runtime은 canvas/web, 이미 활성인 경우에만 ai/expo다. 동시 인증 변경을 함께 채택하면 `node scripts/deploy-cloud.mjs release all`의 결합 검증을 따른다. staging에 호환 API와 새 웹을 함께 준비하고 동일 소스 통과 receipt를 확인한 후 production을 진행한다. 여기서는 release 명령을 실행하지 않았다.


후속 정정: 이 문서는 worker 후보 종료 시점의 보고서다. 신뢰 host가 최종 후보를 채택·추가 수정하고 실제 검증·staging-first 운영 배포를 완료했다. 현재 결과는 [배포 보고서](2026-10-19-1438-blog-markdown-release.md)를 따른다.
