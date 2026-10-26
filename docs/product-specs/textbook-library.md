# 전공서 책장

2026-10-26 클라우드·선택 사전 기능 운영 반영 완료. 전체 staging 107/107, 두 기기·100MiB 원본·OFF/ON 검증과 기존 앱 반영 결과는 [최종 릴리스 기록](../../logs/report/2026-10-26-2049-workspace-library-app-release.md)을 따른다. 이전 기기 전용 웹/앱 1.3 릴리스는 [웹](../../logs/report/2026-10-24-0033-textbook-library-web.md)·[앱](../../logs/report/2026-10-24-0745-textbook-library-app-release.md) 기록을 따른다.


2026-10-27 페이지 넘기기·두 쪽 보기·한국어 복수 뜻 개선도 운영 반영 완료했다. 이번 전체 staging116/116·핵심9/9와 기존 앱 검증, 실제 배포ID·제한은 [릴리스 기록](../../logs/report/2026-10-27-0327-reader-korean-app-release.md)을 따른다.

## 책장과 읽기

`/library`에서 사용자가 올린 PDF를 제목이 세로로 쓰인 책등으로 보여준다. 분야 칸막이·검색·즐겨찾기를 유지한다. 책등을 고르면 첫 PDF 페이지 표지를 먼저 보여주고 명시적으로 읽기를 시작한다. 실제 표지가 PDF 첫 페이지가 아니면 첫 페이지 이미지가 보인다.

- 폭 맞춤, 확대, 여백 줄이기, 좌우 단 집중 보기를 제공한다. 원본을 재배치하지 않아 수식·그림의 배치를 유지한다.
- 한 쪽/두 쪽 보기를 선택하고 계정·책별 기기 선호를 기억한다. 두 쪽은 1–2, 3–4 순으로 함께 표시하며 홀수 마지막 쪽에 없는 페이지를 요청하지 않는다. 각 페이지의 canvas 긴 변은 4096px 이하로 제한하고 텍스트층도 각각 유지한다. 선택 사전은 선택한 실제 페이지 번호로 기록한다.
- 휠·Space/Shift+Space·좌우 스와이프로 페이지/펼침을 넘긴다. 확대/페이지 안쪽의 스크롤은 경계에 도달하기 전까지 유지한다. 한 휠 제스처의 관성으로 여러 펼침을 연달아 넘기지 않으며 긴 텍스트 선택·복수 접촉·핀치·폼/대화상자 입력을 방해하지 않는다.
- 준비가 끝난 뒤 약 3.2초 동안 입력이 없으면 겹침형 상·하단 읽기 도구를 숨긴다. 페이지 크기는 변하지 않으며 작은 진행 표시/도구 토글과 세로 메뉴는 유지한다. 컨트롤의 키보드 포커스, 선택 텍스트, 메뉴/대화상자 사용 중에는 자동으로 숨기지 않는다. 여백·단 집중 설정과 책갈피 목록은 읽기 설정에서 사용한다.
- 표시 버튼은 최소44px 터치 영역을 갖는다. PDF 첫 줄은 상단 도구 아래에서 시작하고 선택 검색은 실제 하단 도구 높이 위에12px 간격으로 배치한다. 작은 화면의 중복 설정은 More 메뉴로 모은다. 읽기 화면의 앱 하단 여백 중복을 제거해 외부 body 대신 PDF 영역 안에서 스크롤한다.
- 읽기 메뉴에서 제목·분야를 바꾸고 사전·단어장을 연다. 표지 화면에도 원본 내보내기와 기본 편집 동작을 유지한다.

## 계정별 클라우드와 기기 보관

PDF 원본, 표지, 제목·분야, 즐겨찾기, 읽던 페이지와 책갈피를 현재 로그인 계정으로 공유한다. 새 기기는 메타 목록을 먼저 받아 책장을 표시하고, 원본이 필요하면 인증된 다운로드로 가져와 기기에 보관한다. 새로고침·창 복귀·화면이 활성화된 동안의 주기 동기화로 다른 기기 변경을 조회한다.

- 기존 `flownote-textbook-library` IndexedDB v1의 `books`·`files`를 유지하고 v2에서 `terms` 저장소를 추가한다. 기존 기기 책의 ID와 원본을 보존해 업로드한다. 새 클라우드가 빈 책장이라고 기기 자료를 비우지 않는다.
- 기기 저장을 먼저 완료하고 클라우드 업로드를 시작한다. 실패해도 기기 원본·진행 중 편집·재시도 상태를 유지하고 UI에 알린다. 업로드가 완료되기 전에는 다른 기기에 원본이 보관됐다고 표시하지 않는다.
- PDF 상한은 100MiB다. 1MiB 조각으로 나눠 올리며 서버가 조각 번호·크기·SHA-256·첫 조각의 PDF 헤더를 확인한다. 모든 조각이 모인 뒤에만 책을 공개한다. 재시작한 업로드는 기존 조각을 재사용한다.
- 원본은 S3의 비공개 키에 보관하고 메타/조각 매니페스트는 PostgreSQL에 보관한다. 공개 스토리지 URL을 반환하지 않는다. 인증·소유권 검사를 거친 API가 조각을 검증하며 원본을 스트리밍한다.
- 변경은 서버 revision과 필드별 기기 편집 세대를 대조한다. 오래된 ACK는 이후 편집을 지우지 않는다. 서로 다른 필드는 함께 반영하고 책갈피는 공통 기준 이후 추가·삭제를 병합한다.
- 삭제는 클라우드 tombstone을 남겨 오래된 기기가 책을 다시 올리지 않게 한다. 삭제된 원본은 즉시 API에서 접근할 수 없고 정리 작업이 오브젝트를 제거한다. 미완성 업로드는 24시간 후 정리 대상으로 삼는다.

## 동기화 OFF/ON

설정에서 끄기 전에 클라우드 책장과 기기 변경을 조정하고 모든 책의 원본과 단어장을 기기에 내려받는다. 실패·저장 공간 부족 시 OFF로 바꾸지 않고 기존 자료와 모드를 유지한다. OFF에서는 기기 원본을 읽고 메타/단어장 변경을 기기에만 기록한다. 다시 켜는 명시적 전환 동안에만 제한된 네트워크 scope를 열어 대기 변경을 전송한다.

기기 JSON 백업에는 PDF 원본을 포함하지 않는다. 표지의 `원본 PDF 내보내기`를 사용한다. 새로 추가한 책이 클라우드에 동기화되기 전에 앱·사이트 데이터를 지우면 기기 원본을 잃을 수 있다.

## PDF 선택과 사전·단어장

원본 PDF의 텍스트 내용을 페이지·확대·단 집중 영역에 맞춰 별도 선택층으로 배치한다. 마우스 드래그와 지원 기기의 텍스트 선택을 사용해 짧은 단어·구절을 선택하면 사전 검색 버튼을 제공한다. 그림으로만 된 스캔 페이지에는 선택 가능한 텍스트가 없음을 알리고 직접 단어 입력을 제공한다. OCR·본문 재배치·AI 해설·필기 레이어는 구현 범위가 아니다.

- 최대 120자의 선택어를 고정 HTTPS Wiktionary 정의 API에 조회한다. 서로 다른 품사를 우선 포함해 중복 없는 뜻을 최대8개 추출하고, 각 원문 뜻을 공식 Gemini API로 한국어 번역한다. UI는 뜻별 번호·한국어 품사·한국어 뜻과 접어서 볼 수 있는 원문을 함께 제공한다. 외부 번역에는 선택어와 공개 사전 정의만 보내며 PDF·책 제목·계정·개인 메모는 보내지 않는다.
- 번역 배열 길이·한국어 포함·크기를 검증하며 영어만 반환한 응답을 한국어 조회 성공으로 표시하지 않는다. 실패 시 한국어 안내와 재시도 경로를 유지한다. 번역은 24시간/512개 캐시와 중복 요청 결합, 최대4개 동시 호출을 사용한다. 본인 책 확인 후 사용자당 분당20회 조회를 허용한다.
- 책 ID·페이지·선택어·정의·출처를 단어장에 저장하고 다른 기기에서도 조회한다. 검색 결과가 없으면 선택어를 보관하고 뜻·메모를 직접 적을 수 있다. 조회 실패 시 기기 기록과 재시도 경로를 유지한다.
- 새 단어의 한국어 복수 뜻은 기존 definition 필드에 번호를 붙여 저장한다. 조회를 반복해도 기존 뜻·직접 편집한 메모를 덮어쓰지 않는다. 사용자가 명시적으로 한국어 검색 결과 반영을 선택하거나 뜻·메모를 편집해 갱신한다.
- 정의는 HTML을 텍스트로 바꿔 표시하고 Wiktionary/CC BY-SA 출처 링크를 제공한다. 리다이렉트·외부 임의 호스트·임의 URL 입력은 허용하지 않는다.
- OFF에서도 기기 단어장을 볼 수 있고 단어·뜻을 저장할 수 있다. 외부 사전 조회는 ON 뒤에 사용한다.

## 구현·API 소유권

`features/library`가 PDF·기기 저장·동기화·단어장 모델을, `pages/LibraryPage`가 UI를 소유한다. `flownote-canvas/internal/library`가 인증된 데이터/오브젝트 접근과 고정 사전 조회를 소유한다. Gateway는 `/api/library/**`를 canvas 서비스에 전달하고 요청 크기를 제한한다. Flyway V22가 `library_books`, `library_uploads`, `library_upload_chunks`, `library_terms`를 만든다.

| API | 계약 |
| --- | --- |
| `GET /api/library/books` | 50개씩 조회, `nextCursor`, tombstone 포함 |
| `POST /api/library/uploads` | 검증된 책 메타, 기존 업로드 재개 |
| `PUT /api/library/uploads/{id}/chunks/{part}` | 최대 1MiB, `X-Chunk-Sha256` |
| `POST /api/library/uploads/{id}/complete` | 모든 조각 검증 후 책 생성, 같은 업로드의 재시도 멱등 |
| `GET /api/library/books/{id}` 및 `/file` | 본인 메타·원본, 타 계정은 404 |
| `PATCH /api/library/books/{id}` | `revision`, `changes`, 충돌 409 |
| `DELETE /api/library/books/{id}?revision=…` | revision 검사 후 tombstone |
| `POST /api/library/books/{id}/lookup` | 단어·페이지 조회와 한국어 결과 저장, result.language=ko, senses[{partOfSpeech,definition,translation}] 및 기존 definition 유지 |
| `GET/POST /api/library/books/{id}/terms` | 본인 단어장 조회·명시적 수정 |
| `DELETE /api/library/books/{id}/terms/{termId}` | 본인 책/단어에 한정 |

서버 세션이 실제 소유자를 결정한다. 웹은 `X-Flownote-Expected-Owner`를 보내 화면의 계정과 서버 세션이 다르면 쓰기 전에 거부하게 하고, 응답의 `X-Flownote-Owner`도 대조한 뒤 계정별 기기 저장소에 반영한다. 계정 ID 헤더는 인증 수단이 아니다. 모든 응답은 `no-store`다. 토큰·PDF 원본·선택어/정의 본문은 로그에 기록하지 않는다.

## 앱 1.3.0 저장 계약

Android 1.3.0·iOS/iPadOS 1.3.0(8)·Windows 1.3.1은 같은 고정 HTTPS 화면을 연다. 이번 공유 웹/API 변경으로 native 권한이나 새 일반 브리지를 추가하지 않는다. 실제 설치본 검증과 물리 기기 확인 범위는 릴리스 보고서가 소유한다.

iOS PDF 내보내기는 256KiB 확인 응답 기반 전송으로 100MiB까지 지원한다. 사용자 확인 후 공유 메뉴로 내보내고 취소/오류 시 부분 파일을 정리한다. 그 밖의 형식은 기존 8MiB 제한을 유지한다. Android는 기존 선택기와 256KiB private cache 전송으로 100MiB PDF를 내보내며 다른 형식의 기존 제한을 유지한다. Windows는 Electron 다운로드/저장 경로를 사용한다. 앱 업데이트가 프로필·IndexedDB를 삭제해서는 안 된다.

## 검증·출시

모델·Go·API·Spring 검증 후 `node scripts/deploy-cloud.mjs release library`로 main → canvas → api → web을 staging에 배포한다. 실제 계정 두 개의 소유권·다른 기기의 원본/메타·100MiB 해시·삭제·사전 기록·OFF/ON·선택층을 확인한 동일 소스만 production에 승격한다. 앱 배포는 application manage에 인계한다. 브라우저/WebKit·브리지 에뮬레이션과 실제 iPad/Pencil 기기 검증을 구분한다.

번역 설정은 canvas 서비스의 `FLOWNOTE_DICTIONARY_TRANSLATION_KEY`(비밀값)와 `FLOWNOTE_DICTIONARY_TRANSLATION_MODEL`(기본 gemini-3.1-flash-lite)이다. 기존 AI 서비스/기능은 켜지 않는다. schema/gateway 변경이 없는 이번 개선의 배포 대상은 `blog`(canvas/web)다.

참조: [공식 Gemini 번역 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [공식 구조화 응답](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [PDF.js](https://github.com/mozilla/pdf.js), [Wiktionary 정의 API](https://en.wiktionary.org/api/rest_v1/), [진행 계획](../exec-plan/active/2026-10-26-workspace-library-ux.md).
