# 전공서 웹 책장

## 범위와 구현

사용자 요청의 Android·iOS·Windows 공통 전공서 기능 중 웹 첫 버전을 구현·운영 배포했다. 사용자가 첫 자료 공급 방식으로 PDF 업로드를 선택했다. 기존 베이지·흰색·검은색 작업 공간과 capability 매니페스트를 사용하고 새 `/library` 보호 라우트를 지연 로드한다. 네이티브 바이너리, 백엔드 API·DB 스키마·의존성은 변경하지 않았다.

- 세로 제목의 책등, 분야별 선반·칸막이, 제목·분야 검색, 즐겨찾기.
- 책 추가 후 또는 책등 선택 시 PDF 첫 페이지 표지부터 표시. 제목·분야 수정과 책 삭제.
- 읽던 페이지 복원, 페이지 이동·책갈피, 원본 PDF 내보내기.
- 스마트폰 폭 맞춤·확대·여백 줄이기·좌우 단 집중 보기. 원본 수식·그림의 배치는 유지하고 재배치하지 않는다.
- 계정·브라우저 origin별 IndexedDB에 원본과 메타를 원자적으로 저장하고, 목록은 PDF 원본을 읽지 않는다. 저장 성공은 트랜잭션 완료를 기준으로 한다.

제품·후속 범위: [전공서 책장](../../docs/product-specs/textbook-library.md).

## 정적 검증과 화면 확인

- `cd flownote && yarn verify`: 전체 lint/typecheck/production build 통과. 기존 PDF.js eval 및 큰 청크 경고는 남는다. 새 PDF 로드는 `isEvalSupported=false`다.
- `node --test src/features/library/model/library.test.mjs tests/blog-bundle.test.mjs`: 5/5 통과. 입력 제한·페이지 경계·책갈피·단 영역 계산 및 기존 초기 번들 분리 검증.
- `node --check flownote/e2e-cloud/textbook-library.spec.ts`, `git diff --check`: 통과.
- staging의 실제 합성 PDF 6권으로 1440px 데스크톱과 390px 스마트폰 책장·표지·읽기 화면을 확인했다. 독립 화면 검사에서 page error 0, 화면 자체의 가로 넘침 0px.
- 화면 산출물: `.release/library-visual/desktop.png`, `phone-shelf.png`, `phone-cover.png`, `phone-reader.png`. 실제 사용자 문서나 production 데이터를 사용하지 않았다.

## 최초 실패와 수정

첫 `release web`의 전체 staging gate는 79/83 통과, 4건 실패로 production 승격 없이 종료했다. 신규 WebKit 3건은 File/Blob의 IndexedDB 저장 실패였다. 원본 ArrayBuffer를 트랜잭션 전에 준비해 저장하도록 수정하고 기존 Blob 읽기 호환은 유지했다. 메타만 남는 부분 저장은 발생하지 않았다.

나머지 기존 Android 노트 생성 1건은 staging gateway POST `/api/notes` HTTP 502였다. 같은 합성 요청의 독립 생성·정리는 HTTP 200이었다. 기존 테스트를 약화하지 않고 전체 검증을 다시 실행했다. [원인과 수정 기록](../bugs/2026-10-24-textbook-webkit-file-storage.md).

실패 산출물과 첫 gate 로그는 `/tmp/flownote-library-release-20261024/.release/first-gate-results/`와 `first-gate.log`에 보존했다. 별도 Chromium/WebKit 책장 검사도 동일 저장 실패를 재현했다. 수정 후 WebKit 재검증 4/4와 전체 회귀 gate 83/83을 통과했다. 전체 gate는 retries=0, 8.6분이며 새 책장 Chromium/WebKit 8건과 기존 노트·캔버스·기기 동기화·앱 탐색을 모두 포함한다. 최종 소스로 WebKit 화면 캡처 4개도 재확인했으며 page error 0, 화면 가로 넘침 0px였다.

## 배포 상태

상태: staging 검증과 동일 소스 production 웹 배포 완료.

| 환경 | deployment ID | 결과 |
| --- | --- | --- |
| staging | `dpl_HeVGXvBW5n1zuG4Piqt4cKoFX1y5` | READY, 83/83 E2E 통과 |
| production | `dpl_9TaqvRqnQMGBrdKxVrxy7c86WEkH` | READY, smoke 통과 |

- staging immutable: <https://flownote-react-staging-79ktbg654-flownote-service.vercel.app>.
- production immutable: <https://flownote-react-e0x35yzn4-flownote-service.vercel.app>.
- 사용자 URL: <https://flownote-react.vercel.app/library>.
- staging gate 통과: 2026-10-24 00:41:00 KST (`2026-10-23T15:41:00.809Z`).
- production 완료: 2026-10-24 00:42:00 KST (`2026-10-23T15:42:00.729Z`).
- 두 영수증의 fingerprint 동일: `22ca4a3e3196cc7f7b61e495a5e0cd9061f028ece90cf1a9051b6abfb1ba9728`.
- 영수증: `/tmp/flownote-library-release-20261024/.release/staging-web.json`, `production-web.json`. 수정한 소스·테스트 15개가 원본과 배포 snapshot에서 동일함을 확인했다.
- 독립 운영 read-back: Vercel alias가 정확한 production ID와 일치하고 READY다. `/library`·진입 JS/CSS·gateway root는 HTTP 200, 비인증 `/api/users/me`는 401. 운영 진입 JS의 새 `/library` 라우트도 확인했다. 최종 문서 상대 링크와 `git diff --check`는 통과했다.

- 실행: `FLOWNOTE_RELEASE_SOURCE_ROOT=/tmp/flownote-library-release-20261024 node scripts/deploy-cloud.mjs release web`.
- 원본의 기존 dirty 변경을 보존하고 격리 snapshot에서 배포한다. 같은 소스로 staging을 통과한 뒤 production으로 승격한다.
- 시작 시 rollback 기준: production `dpl_F2bWWQQeCqoFu7sXNXTYRaPZTPEN`, READY.
- Railway 인증 만료는 사용자 로그인 완료 후 CLI read-back으로 복구를 확인했다. 기존 공개 URL/환경 정책 검증을 유지하며 앱 백엔드는 변경이 없어 재배포하지 않는다.

운영 사용자 문서나 계정에 CRUD 테스트를 실행하지 않았다. 실행 코드와 함께 작성한 제품 문서의 완료 상태 및 보고서만 배포 후 마감하며, 이 기록 마감으로 backend Docker 재빌드는 필요하지 않다.

## 제한과 다음 단계

PDF·읽기 기록은 현재 브라우저에 저장하며 기기 간 동기화와 기존 기기 JSON 백업에는 아직 포함하지 않는다. 사이트 데이터 삭제·저장소 회수에 대비해 원본을 보관한다. PDF 최대 100MiB이며 암호 PDF와 자동 OCR·본문 재배치·텍스트 선택/스크린 리더 본문 계층·PDF 목차 추출·필기는 이번 범위에 없다. 표지는 PDF 첫 페이지다.

스마트폰·iPad 브라우저 에뮬레이션과 네이티브 물리 기기 검증을 구분한다. Android·iOS·Windows 앱별 파일 선택·보관·큰 파일 내보내기와 서버 동기화는 후속 단계다. iOS 기존 native export bridge는 8MiB 제한이 있어 대용량 책 내보내기에는 별도 검증·설계가 필요하다. 이번 웹 구현을 앱별 빌드·릴리스 완료라고 표시하지 않는다.
