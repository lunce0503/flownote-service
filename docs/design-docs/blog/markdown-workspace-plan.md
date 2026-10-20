# 게시글 Markdown·탐색 사이드바·로딩 개선 설계

작성: 2026-10-19. 상태: isolated snapshot 구현 후보 작성, 신뢰 환경 채택·Go/cloud 검증 전.
제품 기준: [Markdown 작업 공간](../../product-specs/blog-markdown-workspace.md).
실행 추적: [게시글 개편 계획](../../exec-plan/completed/2026-10-19-blog-markdown-workspace.md).

## 원인 조사와 현재 근거

| 경로 | 현재 동작 | 영향과 판정 |
| --- | --- | --- |
| Go `notes.Repo.List` | 각 노트의 R2/S3 본문을 순차 Get | 확인된 N+1 구조. 노트 수에 따라 본문 요청·응답량이 증가하고 한 본문 실패가 목록 전체를 실패시킴 |
| 웹 `BlockNote.tsx` | `getNoteData()`로 전체 목록을 받은 뒤 noteId 검색 | 단건 열기와 동기화/충돌 갱신까지 전체 본문 조회에 의존 |
| `BlogWidget/index.ts` | 목록과 BlockNote 편집기를 함께 재수출 | 처음에는 가설. 후보 production bundle의 정적 import 그래프에서 `vendor-react → editor-blocknote`를 재현했다. manualChunks의 `/react/`가 `@blocknote/react`까지 포함하는 문제를 package-root 분기와 공용 helper 고정으로 수정했다. 후속 리뷰에서 explicit·편집기 수동 청크의 순환도 제거했다. 수정 후 정적 그래프 테스트 통과; 실제 staging 네트워크와 전체 47개 E2E 통과 |
| 목록·sync | 전체 목록 재조회와 페이지 단위 loading | 관련 없는 변경에도 전체 작업 공간이 지연될 수 있음. 요청 수·취소·캐시를 확인 |
| staging 측정 | 합성 계정 생성 POST가 502, 이후 gateway·mobile config GET은 200 | 최초 생성 POST 502 이후 warm 합성 실행은 성공. 5개 노트·5회 교대 목록 median 954ms/33,348 bytes, Canvas 201ms/770 bytes. API 목록 관측이며 browser 전체/production 수치가 아님. 최초 502·콜드스타트 원인은 미확정 |

비밀값·실제 노트·production 데이터를 읽지 않고 합성 staging 계정으로 재현한다. 배포 로그와 응답 상태·요청 시각만 조사하며 원문·토큰은 기록하지 않는다. 인프라 전체 장애와 게시글 조회 설계를 구분한다.

## 영향 범위와 구현 순서

1. `flownote-canvas/internal/notes/`: 메타 목록·단건 조회·형식 계약과 테스트.
2. `flownote/src/entities/blog/`, `features/blog/`: summary/detail 타입·API·변환·초안·선택/저장 큐.
3. `widgets/BlogWidget/`, `pages/BlogPage`, `pages/BlogDetailPage`: 공유 작업 공간, 트리 사이드바, Markdown 편집과 지연 미리보기. 두 경로에서 탐색이 유지되게 한다.
4. `flownote-mobile`, Agent 등 기존 소비자: 형식/목록 호환 조사와 필요한 최소 대응. 기본 탐색·인증 계약은 유지한다.
5. format 또는 부모 폴더 등 스키마가 꼭 필요하면 Spring Flyway를 사용한다. 버전 번호는 실제 최신 migration을 확인한다. 단순한 트리 표현만으로 충분하면 중첩 폴더 migration은 추가하지 않는다.
6. 제품·코드맵·버그 기록, 신규 cloud E2E와 실제 측정, 리뷰·staging-first 배포.

## API와 저장 계약

- [노트 조회 분리 계획](note-query-split-plan.md)의 additive summary/detail 계약을 재사용한다. 예: `GET /api/notes?view=summary&limit=50&cursor=...`, `GET /api/notes/{id}`. 서버·클라이언트 테스트에서 실제 응답과 오류 코드를 먼저 고정한다.
- summary는 `id/title/created_at/updated_at/revision` 등 목록 메타데이터만 반환하고 R2 Get을 하지 않는다. 전용 타입을 사용하며 본문이 없는 것을 `content: []`로 위장하지 않는다.
- 단건 조회는 소유권 확인 뒤 해당 본문만 읽는다. 페이지 경계·동률 정렬·없는/타 사용자 노트·본문 장애를 테스트한다.
- 새 문서의 Markdown 원문은 명시적인 format/version으로 저장한다. 기존 JSON 문서·원본 백업·전환 상태와 구분한다. 문자열을 기존 블록 배열로 오인하거나 렌더 결과에서 원문을 재구성하지 않는다.
- 기존 소비자의 GET/POST를 조사하고 구형 요청으로 Markdown을 덮어쓰는 동작을 거부한다. 레거시 조회 응답을 바꾸면 별도 버전·명시적 opt-in을 사용한다. 데이터 일괄 변환은 하지 않는다.
- 초안은 사용자·노트·형식·기준 revision·로컬 변경 순서를 포함한다. 오래된 저장 ack/노트 선택 응답은 최신 문서·초안을 덮어쓰지 않는다. 서버 충돌 시 로컬 입력과 원본을 보존한다.
- 현재 폴더 category/name/note_ids와 단일 폴더 소속 API를 활용한다. 폴더 변경이 노트 본문 재저장을 유발하지 않게 한다.

## UI·보안

공유 shell은 Canvas의 간결한 topbar·테두리·아이콘 규칙을 사용하고 좌측 트리와 우측 문서에 공간을 배분한다. 편집기는 Markdown 원문을 기준으로 제목·편집/미리보기/나란히 보기·저장 상태를 제공한다. 현재 BlockNote 전체를 초기 목록 경로에서 가져오지 않는다. 기존 문서의 원본 뷰나 변환에 필요할 때만 지연 로드한다.

트리는 키보드 방향키/Enter, focus, aria-expanded·선택 상태를 제공하고 모바일 drawer는 Escape·포커스 복귀·터치 이동 메뉴를 지원한다. 긴 한글/파일명·코드·수식은 작업 공간 바깥으로 넘치지 않는다. Markdown 미리보기는 raw HTML을 실행하지 않고 javascript/data 등 위험 URL을 차단한다. 임의 호스트 파일 경로·업로드 원본·세션 토큰을 저장 형식에 섞지 않는다.

## 완료 기준

- Markdown 원문·수식·표·코드·이미지를 편집·저장·재로드하고 .md 내보내기로 같은 원문을 얻는다.
- 기존 BlockNote 문서 진입 시 mutation 0회. 전환 후에도 원본 복구·지원 불가 블록 안내가 동작한다.
- 목록 요청의 object storage Get 0회, 상세는 선택 노트 본문만 읽는다. 한 손상 문서가 정상 목록/노트를 막지 않는다.
- 폴더/노트 생성·이름·이동·삭제·선택·빠른 전환·새로고침, 빠른 이동 전 입력 복구가 동작한다.
- 블로그 목록 진입에 BlockNote/Markdown 미리보기 vendor 다운로드가 선행되지 않는 것을 네트워크·빌드 산출물로 확인한다.
- 같은 합성 데이터에서 warm/cold 조건을 나눠 Canvas 메타 목록/단건과 게시글을 각각 5회 이상 측정한다. TTFB·payload·API 개수·사용 가능 시각과 p50/관찰 범위를 기록한다. warm 게시글이 Canvas 대비 크게 느리면 원인을 설명하고 미해결로 남긴다. 근거 없이 같은 속도가 됐다고 표시하지 않는다.
- 390/820/1440px 및 웹·Android/Windows 공유 UI에서 가로 넘침·가림·키보드·포커스를 검증한다.

## 검증과 기존 후보 재사용

`yarn verify`, Markdown 변환·초안·트리 순수 테스트, `cd flownote-canvas && go test ./...`, 필요한 Spring/gateway 검사를 실행한다. 기존 staging specs를 무조건 지우거나 약화하지 않고 새 Markdown 기본 동작과 레거시 보존으로 갱신한다. 새 cloud spec에서 실제 저장·폴더·충돌·로딩 요청과 no-local-network를 확인한다.

10월 18일 MVP worker는 네 수정의 후보 patch와 Node 23개 통과를 남겼지만 full build·Go·Java·staging 검증은 못했고 원본에도 반영되지 않았다. 이번에는 그 patch 전체를 적용하지 않고 노트 summary/detail·초안 코드만 참고해 현재 인증·사용자 변경과 계약을 다시 검증한다. 플래너·AI 변경은 이번 개편에 섞지 않는다.

릴리스는 영향 서비스의 build/test·리뷰 후 `node scripts/deploy-cloud.mjs release <target>`의 staging-first 절차를 사용한다. 여러 대상의 source fingerprint·서버/웹 호환 순서를 검증하며 migration이 있으면 main → 호환 Canvas API → web 순서를 따른다. 실제 검증 실패·소스 동시 변경은 production 승격을 중단하고 실행 계획에 남긴다.

## 2026-10-19 staging 후속 측정

합성 노트 5개와 Canvas 5개의 목록을 번갈아 5회 측정했다. 게시글 API는 800/814/954/1060/1062ms(중앙값 954ms), Canvas 목록은 129/138/201/202/269ms(중앙값 201ms)였다. 응답 크기는 각각 33,348 bytes와 770 bytes다. 이 데이터는 본문 포함 목록의 비용을 보여주며 production이나 브라우저 전체 로딩 측정이 아니다. Markdown 개편 후 같은 조건에서 재측정한다.

artifact: `~/.local/state/flownote-codex/manual/blog-markdown-20261019/warm-performance.json`. 최초 저장은 도구 준비 중 발생한 ENOSPC로 실패해 stdout 관측값에서 복구했다. finally의 테스트 문서 삭제 요청은 실행됐지만 삭제 건수는 저장되지 않았다. 새 Go 이미지 제거 후 공간을 복구했다. 추가 대용량 도구 설치는 중단하고 web lint/typecheck/build와 Node 테스트를 제공한다. Go 검증은 신뢰한 후속 환경에서 `cd flownote-canvas && go test ./...`로 실행한다.


## 배포 완료 정정

위 초기 조사·도구 제약 기록 이후 신뢰 host에서 기본 yarn verify, Go 전체 테스트, 모바일 verify, AI 4개 테스트와 staging E2E47개를 통과했다. 동일 소스 canvas/web 운영 배포를 완료했다. 새 metadata 목록은 동일 데이터 warm 중앙값180ms로 Canvas182ms와 비슷했으며, 전체 본문 목록594ms보다 빠르고 응답도31,242→892 bytes로 줄었다. 전체 브라우저·production 수치는 아니다. 상세 수치·deployment ID·잔여 범위는 [최종 보고서](../../../logs/report/2026-10-19-1438-blog-markdown-release.md)에 기록한다.
