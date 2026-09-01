# Blog 코드맵

## 목적과 범위

Blog는 BlockNote 기반 텍스트 노트를 작성하고 폴더와 카테고리로 정리하는 기능이다. 이 문서는 웹의 `/blog` 목록부터 Go Notes 저장소까지의 기본 호출 경로를 정리한다.

## 전체 호출 흐름

1. `/blog`의 `BlogList.tsx`가 노트와 폴더를 HTTP로 불러온다.
2. 목록은 `최근 노트 → 카테고리별 폴더 → 폴더 없음` 순서로 표시한다.
3. 노트를 선택하면 ID 기반 `/blog/:noteId`로 이동한다.
4. `BlockNote.tsx`가 노트 목록에서 URL의 `noteId`와 일치하는 노트를 찾아 에디터에 적용한다.
5. 본문이나 제목이 바뀌면 revision을 증가시키고 저장 큐가 `POST /api/notes` upsert를 호출한다.
6. FastAPI Gateway가 요청을 Go Canvas 서비스의 Notes 모듈로 전달한다.
7. Go 서비스는 메타데이터를 PostgreSQL에, 본문 JSON을 S3 호환 저장소에 저장한다.

## 주요 파일

| 경계 | 파일 | 책임 |
| --- | --- | --- |
| 라우팅 | `flownote/src/app/capabilityManifest.tsx` | `/blog`, `/blog/:noteId` 등록 |
| 목록 | `flownote/src/widgets/BlogWidget/BlogList/BlogList.tsx` | 노트·폴더 CRUD, 드래그 이동, 목록 정렬 |
| 편집기 | `flownote/src/widgets/BlogWidget/BlockNote/BlockNote.tsx` | BlockNote 편집, 자동 저장, 충돌 처리, 이미지 업로드 |
| 타입/API | `flownote/src/entities/blog/` | 노트·폴더 타입과 HTTP 호출 |
| 목록 모델 | `flownote/src/features/blog/model/blogListModel.ts` | 빈 노트 생성, 미분류 계산, 카테고리 그룹화 |
| 공통 정렬 | `flownote/src/shared/lib/librarySorting.ts` | Canvas와 공유하는 최근·카테고리 정렬 |
| Gateway | `flownote-API/app/gateway.py` | `/api/notes`, `/api/note-folders`, `/uploads` 프록시 |
| 영속화 | `flownote-canvas/internal/notes/` | 인증, 노트·폴더 CRUD, revision 충돌, 본문 오프로드 |
| 스키마 | `flownote-server/src/main/resources/db/migration/` | `notes`, `note_folders` Flyway 스키마 |

## 통신 계약

| 방식 | 경로 | 목적 |
| --- | --- | --- |
| HTTP | `GET /api/notes` | 사용자 노트 목록과 본문 조회 |
| HTTP | `POST /api/notes` | 노트 생성 또는 revision 기반 본문 upsert |
| HTTP | `PATCH /api/notes/:noteId` | 목록에서 노트 제목 변경 |
| HTTP | `DELETE /api/notes/:noteId` | 노트와 폴더 연결 제거 |
| HTTP | `/api/note-folders/**` | 폴더 CRUD와 노트 소속 변경 |
| HTTP | `POST /api/notes/upload` | 에디터 이미지 업로드 |
| HTTP | `GET /uploads/**` | 업로드 이미지 제공 |

보호 API는 `Authorization: Bearer <session UUID>`를 사용한다. 저장 요청에는 `id`, `title`, `content`, `revision`, `client_id`가 포함된다.

## 저장과 충돌

- 본문 변경은 700ms, 제목 변경은 800ms 이후 저장하며 화면 이탈 시 pending 저장을 flush한다.
- 서버는 더 큰 revision만 반영한다.
- 같은 `revision + client_id` 재요청은 멱등 요청으로 처리한다.
- 다른 클라이언트의 최신 revision과 충돌하면 409를 받고, 최신 노트를 다시 읽어 로컬 편집 내용을 다음 revision으로 재구성한다.
- 브라우저 간 변경 알림은 `shared/lib/sync` 이벤트로 전달하며 로컬 편집 중에는 원격 내용을 덮어쓰지 않는다.

## 데이터 소유권

- PostgreSQL `notes`: 제목, 사용자, revision, 본문 오브젝트 키와 크기
- PostgreSQL `note_folders`: 카테고리, 폴더명, `note_ids`
- S3 호환 저장소: `note-content/{user}/{note}/{revision}-{client}.json` 본문
- 로컬 업로드 볼륨: BlockNote 이미지와 `/uploads/**` 정적 파일

## 변경 영향표

| 변경 | 함께 확인할 위치 |
| --- | --- |
| 노트 필드 | 웹 타입·API, Go model/repo, Flyway 스키마 |
| 저장/revision | `BlockNote.tsx`, `postNoteData.ts`, Go `repo.go` |
| 목록/폴더 | `BlogList.tsx`, `blogListModel.ts`, 폴더 API |
| 라우트 | `capabilityManifest.tsx`, 목록 링크, `useParams` |
| 이미지 업로드 | BlockNote `uploadFile`, Gateway, Go handler, 업로드 볼륨 |

## 검증

```bash
cd flownote
yarn lint
yarn build
yarn playwright test e2e/library-navigation.spec.ts
```

목록 규모가 커지면 `GET /api/notes`가 모든 본문을 함께 읽는 현재 구조를 메타 목록과 단건 조회로 분리해야 한다.

## 관련 문서

- `ARCHITECTURE.md`
- `docs/design-docs/canvas/canvas.md`
- `docs/FRONTEND.md`
- `docs/RELIABILITY.md`
