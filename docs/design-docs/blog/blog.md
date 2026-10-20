# Blog 코드맵

2026-10-19: Markdown 작업 공간 운영 배포 완료. 검증·배포 근거는 [완료 실행 계획](../../exec-plan/completed/2026-10-19-blog-markdown-workspace.md)에서 구분한다.

## 호출 흐름과 소유 파일

`/blog`와 `/blog/:noteId`는 `widgets/BlogWidget/MarkdownWorkspace/MarkdownWorkspace.tsx`를 공유한다. category → folder → note와 미분류를 실제 `note_folders.category/name/note_ids`로 구성한다. 임의 깊이 폴더는 저장하지 않는다. 폴더 CRUD·단일 폴더 소속 이동은 기존 API를 사용하며 본문 저장을 유발하지 않는다. 폴더만 삭제하면 노트는 미분류에 남는다.

| 경계 | 파일 | 책임 |
| --- | --- | --- |
| 라우팅 | `flownote/src/pages/BlogPage`, `BlogDetailPage` | 같은 작업 공간 진입 |
| 작업 공간 | `flownote/src/widgets/BlogWidget/MarkdownWorkspace/` | 탐색기, 파일 동작, 모바일 drawer, 편집/미리보기/나란히, 원본 JSON·.md 내보내기 |
| API | `flownote/src/entities/blog/api/noteQueries.ts` | 모든 summary 페이지, 선택 상세, 취소·응답 형식 검사 |
| 저장 | `flownote/src/features/blog/model/noteSaveQueue.ts` | 노트별 직렬 저장, revision, 이전 ack 보호, 화면 종료 시 보관 |
| 초안 | `flownote/src/entities/blog/model/noteDrafts.ts` | 사용자/노트별 IndexedDB, atomic ack/rebase, 명시적 복구/폐기 |
| 변환 | `flownote/src/entities/blog/model/markdown.ts` | 명시적 형식, legacy 원본 보존·변환 경고, 안전한 URL |
| 트리 | `flownote/src/features/blog/model/workspaceTree.ts` | 빈 폴더·미분류·중복/사라진 참조 처리 |
| Gateway | `flownote-API/app/gateway.py` | notes의 query/path를 기존 Go Canvas 경계로 전달 (변경 없음) |
| 영속화 | `flownote-canvas/internal/notes/` | 소유권, summary/detail, 저장 형식 검증·CAS, JSON 본문 스토리지 |

이전 `BlogList`/`BlockNote` 소스는 남아 있지만 새 Blog 경로에서 사용하지 않는다. 이전 편집기의 단건·충돌 조회도 detail로 이행했고 Markdown을 구형 편집기에 넣으면 거부한다. Planner의 BlockNote는 유지한다.

## 계약과 저장

- `GET /api/notes`는 기존 전체 본문 배열을 유지한다. 레거시는 BlockNote 배열 그대로, Markdown은 명시적 객체 그대로 반환한다. 빈 배열로 위장하지 않는다.
- `GET /api/notes?view=summary&limit=50&cursor=...`는 `{notes, next_cursor?}`. 본문 없는 `NoteSummary`, limit 1~100, `(created_at DESC, id DESC)`의 사용자별 keyset cursor다. SQL은 본문/오브젝트 키를 조회하지 않고 storage Get을 호출하지 않는다.
- `GET /api/notes/{uuid}`는 소유권을 확인한 한 본문만 읽는다. 잘못된 ID 400, 미존재/다른 사용자 404, 본문 스토리지 실패/손상 502, 인증 없음 401이다.
- `POST /api/notes`는 기존 `id/title/content/revision/client_id` 계약을 유지한다. 새 `content`는 `{format:"markdown",version:1,markdown:string,legacy_original?:blocks[]}`. 렌더 결과에서 원문을 재구성하지 않는다.
- DB `notes.content` JSONB는 레거시에 `[]`, Markdown에 `{format:"markdown",version:1}` 표식만 저장한다. 실제 본문은 기존 object storage에 둔다. 최신 migration은 **V21**이고 새 migration은 필요하지 않다.
- Markdown 업데이트는 정확히 다음 revision이어야 한다. `ON CONFLICT`의 소유권·revision·format 조건이 구형 배열 저장과 동시 전환의 우회를 거부한다. Markdown에서 legacy로 조용히 되돌릴 수 없다. 같은 revision/client의 재시도도 실제 입력이 같아야 ack된다.
- 원본 백업은 클라이언트가 결정하지 않는다. 서버가 첫 명시적 전환 때 이전 본문 전체를 `legacy_original`로 보관하고 이후 요청에서는 기존 백업을 유지한다. 원본 읽기 실패 시 전환을 중단한다. revision/client에 본문 SHA-256을 추가한 object key로 실패한 동시 요청이 승자의 본문을 바꾸지 않게 한다.
- `PATCH /api/notes/{id}` 제목 수정은 기존 본문·표식을 유지한다. 폴더 변경은 본문을 수정하지 않는다.

## 초안과 보안

모든 제목/본문 입력은 debounce 전 사용자·노트·format·기준 revision·고유 sequence를 포함해 IndexedDB에 기록한다. 저장 A가 끝나도 더 최신 B의 초안은 지우지 않으며 B의 기준 revision을 atomic rebase한다. 노트를 떠날 때 예약 저장을 멈추고 진행 중 요청의 ack만 정리한다. 돌아올 때 진행 중 요청 완료를 기다린 뒤 detail과 초안을 비교한다. 다른 선택의 늦은 응답은 취소/수명/사용자 검사로 무시한다.

서버와 다른 초안은 자동 덮어쓰지 않는다. 초안 복구·JSON 내보내기·서버본 사용을 제공한다. 충돌이면 최신 서버본 확인 후 명시적 복구가 필요하다. 기기 보관과 서버 저장 상태를 구분한다. 저장소 실패는 경고하고 현재 원문을 .md로 내보낼 수 있다. 로그아웃은 미저장 초안 삭제를 확인하고 해당 사용자만 정리한다. 세션 만료는 사용자별 초안을 보존한다. 토큰은 초안에 저장하지 않는다. 기존 HttpOnly/Origin/헤더·native Bearer 인증 경계는 유지한다.

미리보기는 별도 lazy chunk로 GFM·수식 라이브러리를 재사용한다. raw HTML은 생략하고 활성 URL·protocol-relative URL·제어 문자를 차단한다. KaTeX `trust:false`, 외부 링크 `noopener noreferrer`, 이미지 `no-referrer`를 적용한다. unsupported/drawing 등은 원본 JSON 보기·다운로드와 변환 안내로 보존한다. 열기만 하는 legacy mutation은 없다.

## 소비자와 출시 순서

웹 Agent의 전체 본문 소비는 `getFirstNoteText`가 Markdown 원문을 읽도록 확장했다. Expo는 기존 전체 목록을 유지하고 상세는 detail을 사용하며 Markdown 원문을 읽기 전용으로 표시하고 제목 저장 때 원본 객체를 재전송한다. MCP note 도구는 새 Markdown 객체를 생성/갱신하고 기존 ID의 revision은 detail로 확인한다. 구형 클라이언트의 배열 쓰기는 서버에서 409로 보호한다.

신뢰 환경에서 **Go API를 먼저**, 웹·변경된 native/MCP 소비자를 나중에 staging에서 검증한다. DB V21 적용 상태와 Gateway가 notes 전체를 Go로 보내는 것을 확인한다. 새 writer가 배포된 뒤에는 format 보호 없는 구 API로 rollback하지 않는다. 모든 writer의 호환을 확인하기 전 기본 전체 목록을 제거하지 않는다. 실제 환경 조회·Go/Flyway 실행·클라우드 채택/배포는 이 snapshot에서 하지 않았다.

검증 명령과 측정은 [Markdown 설계](markdown-workspace-plan.md), [저장 복구](note-save-recovery-plan.md), [조회 분리](note-query-split-plan.md), [완료 계획](../../exec-plan/completed/2026-10-19-blog-markdown-workspace.md)을 따른다.
