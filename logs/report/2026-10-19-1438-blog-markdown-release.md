# 게시글 Markdown 작업 공간 운영 배포

완료: 2026-10-19T14:36:15.036Z (이 보고서 파일명은 실행 환경의 UTC 24시간제). 사용자 요청에 따라 구현 검토·반영부터 staging-first 운영 배포까지 완료했다.

## 결과

운영: https://flownote-react.vercel.app/blog

- Markdown 원문 편집·안전한 미리보기·나란히 보기·정확한 .md 내보내기, Canvas 스타일 작업 공간과 category → folder → note 탐색기를 적용했다. 노트/폴더 생성·이름·이동·삭제, 모바일 drawer·키보드 탐색을 제공한다.
- 기본 목록은 본문 없는 페이지형 summary를 먼저 표시하며, 선택한 detail만 읽는다. 늦은 다음 페이지가 첫 페이지 사용을 막지 않는다. 기존 편집기와 preview/KaTeX는 초기 앱/Blog 정적 의존성에서 제외했다.
- legacy는 열기만으로 변환하지 않는다. 명시적 변환 시 서버가 전체 원본 JSON을 보관하고 구형 배열 쓰기를 차단한다. 사용자/노트별 IndexedDB 초안, 최신 입력을 지키는 ack/rebase, 실제 409의 확인 후 복구, 저장·detail 장애 시 내보내기를 적용했다.
- 관련 39개 소스·테스트를 기준 snapshot과 파일별 비교 후 채택했다. 이미 배포된 인증·Canvas/PDF 등의 기존 변경을 보존했다. 기존 MVP의 플래너·AI 기능 후보 전체를 합치지 않았다.

## 느린 로딩 원인과 측정

기존 Go 목록이 N개 본문을 R2에서 순차 조회했고 에디터도 전체 목록에서 선택 노트를 찾았다. Vite의 넓은 `/react/` 경로 조건은 `@blocknote/react`까지 공통 React 청크에 묶었다. 초기 번들 그래프로 이 경로를 재현했다. API를 additive summary/detail로 분리하고 React package root와 공용 interop helper만 고정했다. 추가 검토에서 explicit/editor 수동 청크가 만들던 순환도 제거했다.

동일 staging 서버·합성 Markdown 노트 5개(각 약 6KB)와 빈 Canvas 5개·5회 교대 warm 요청, body 수신 완료까지의 중앙값이다.

| API | 중앙값 | 응답 bytes |
| --- | ---: | ---: |
| 호환용 전체 본문 목록 | 594ms | 31,242 |
| 새 summary 목록 | 180ms | 892 |
| Canvas 목록 | 182ms | 827 |
| 선택 노트 detail | 266ms | 6,248 |

동일 데이터의 전체 목록 대비 summary 요청은 약 70% 빠르고 응답은 약 97% 작다. 운영/전체 브라우저/콜드 접속 속도를 의미하지 않는다. 변경 전 별도 BlockNote fixture 관측값 954ms와 이번 594ms는 형식·시점이 달라 직접 개선율 계산에 쓰지 않았다. 측정 자산 10개는 모두 삭제 확인했다. 숫자만 기록한 원본: `/home/kwon/.local/state/flownote-codex/manual/blog-markdown-20261019/release-checks/post-performance.json`.

## 검증

| 검사 | 결과 |
| --- | --- |
| `cd flownote && yarn verify` | lint/typecheck/production build 통과; 기존 pdf.js eval·큰 lazy chunk 경고 잔존, circular chunk 경고 없음 |
| blog 모델 Node tests / 실제 dist graph test | 21개 / 1개 통과; 이름이 바뀐 청크도 BlockNote 구현 문자열로 확인 |
| `cd flownote-canvas && go test -p 1 ./...` | 모든 패키지 통과, notes gofmt 완료. 공식 SHA256 확인 Go 1.23.12를 RAM 전용 검증 컨테이너에서 사용 |
| `cd flownote-mobile && yarn verify` | lint/typecheck/정적 서버 테스트 5개/web export 통과. 별도 note-content 테스트 1개 통과 |
| `cd flownote-ai && uv run python -m compileall -q mcpServers/note_tools.py`; `uv run pytest -q` | 통과 / 4개 통과 |
| `node --test scripts/cloud-resource-policy.test.mjs`; 배포 스크립트 구문; `git diff --check` | 5개 통과 / 통과 / 통과 |
| staging `yarn e2e --retries=0` | **47/47 통과, 4.1분**, skip/retry 없음. 인증·Android/Windows UA·폴더 CRUD·원본·권한·실제 충돌·초안·부분 장애·Canvas/PDF/플래너 회귀 포함 |
| 실제 staging 화면 검토 | 1440px 데스크톱, 390px drawer/편집기·밝은 테마 screenshots; 820px 포함 E2E 가로 넘침·포커스 검사. 추가 브라우저 실행 오류 없음 |

검증 도중 초기 bundle 검사가 eager editor 의존성을 검출해 실패했고, 수동 청크 구성을 고친 후 재빌드·검사를 통과했다. worker의 read-only `.vite-temp` 오류는 신뢰 host에서 기본 명령으로 다시 검증했다. 첫 release 시도는 검증용 mobile node_modules symlink를 fingerprint가 파일로 읽어 EISDIR로 중단됐으며, 직접 만든 임시 링크를 제거하고 같은 명령으로 재개했다. 이 실패 시점에는 클라우드 변경이 없었다. 디스크 제약 때문에 대용량 Go 이미지를 추가하지 않고 RAM 검증 환경을 사용했다.

## 배포와 운영 확인

명령: `node scripts/deploy-cloud.mjs release blog`. 새 blog target은 canvas+web을 함께 staging에 배포하고 전체 cloud E2E 및 source guard를 통과한 동일 fingerprint만 production에 배포한다.

fingerprint: `4df8bdb066b03cc059d781ccf4857e281ff253313a4d525f9985b6a689c7be6e`

| 환경 | 서비스 | deployment ID | 상태 |
| --- | --- | --- | --- |
| staging | flownote-canvas | `7cd338cd-c569-4163-a5ef-3dc55f22fd0a` | SUCCESS |
| staging | web | `dpl_3P4cHXMQThJjoKyQTG1BZbJmgdgJ` | READY |
| production | flownote-canvas | `2cc1d50a-f854-476b-81b7-1a390e67a883` | SUCCESS |
| production | web | `dpl_uuEi4AGvGVPXsW9tjhFtYPrx1Crf` | READY |

- staging web: https://flownote-react-staging-k6rxeydq3-flownote-service.vercel.app
- production immutable web: https://flownote-react-o511n43c0-flownote-service.vercel.app
- production alias read-back은 `dpl_uuEi4AGvGVPXsW9tjhFtYPrx1Crf`, READY와 일치했다. Railway도 `2cc1d50a-f854-476b-81b7-1a390e67a883`, SUCCESS를 재확인했다.
- 배포 후 `/blog`·gateway root·mobile config는 200, 인증 없는 `/api/users/me` 및 same-origin notes summary는 401. HTML/CSS/JS asset smoke 통과. 운영 사용자 데이터 쓰기는 하지 않았다.
- Spring/gateway/serve는 이미 배포된 동일 기준 소스라 다시 배포하지 않았다. 새 migration/스키마 변경은 없다. 중지된 MCP/Expo는 호환성 코드만 검증하고 기동·배포하지 않았다.
- staging/production receipts: `/tmp/flownote-blog-markdown-release-20261019/.release/`. 직접 만든 임시 Go 검증 컨테이너는 ID 확인 후 제거 완료했다.

## 범위와 남은 항목

탐색기는 실제 category/folder/note 계층이며 임의 깊이 폴더는 별도 확장이다. 기존 full-list는 구 소비자 호환을 위해 N+1을 유지하며 새 웹은 사용하지 않는다. 실제 Android/iOS 하드웨어·물리 IME 검증과 광범위한 cold/p95 성능 보장은 이번 결과에 포함하지 않는다. legacy 복잡 서식·그리기는 원본 JSON으로 보존하며 Markdown 표현의 완전한 시각적 동일성은 보장하지 않는다. 이전 MVP의 플래너 동시 수정·AI 가용성은 별도 미완료 계획이다.

실행 계획: [완료 계획](../../docs/exec-plan/completed/2026-10-19-blog-markdown-workspace.md). 제품 기준: [Markdown 작업 공간](../../docs/product-specs/blog-markdown-workspace.md).
