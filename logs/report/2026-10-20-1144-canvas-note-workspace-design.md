# 캔버스·노트 디자인과 폴더 탐색기 운영 반영

완료: 2026-10-20 11:44 KST (Asia/Seoul). [캔버스](https://flownote-react.vercel.app/canvas) · [노트](https://flownote-react.vercel.app/blog).

## 변경 결과

- 노트와 캔버스가 공용 workspace 색상 변수를 사용한다. 밝은 화면은 흰 문서 `#ffffff`, 베이지 탐색/선택 `#f5f1e8`/`#e9e0ce`, 검정 글자/동작 `#211f1b`다. 파란 선택 영역과 남색 표면을 제거했다. 기존에 저장한 테마는 보존하며 다크 모드는 따뜻한 검정/베이지, 새 웹 방문자의 기본은 밝은 모드다.
- 캔버스 카드 그리드를 왼쪽 폴더 트리와 오른쪽 파일 상세 목록으로 바꿨다. 최근 항목/모든 캔버스/미분류, category→folder→canvas, 경로·파일명·수정일·유형·위치/동작을 표시한다. 검색, 키보드 Enter/F2/Delete, 드래그 외 이동 선택, 폴더 이름 변경과 삭제 확인을 제공한다.
- 폴더 삭제는 문서를 미분류에 남긴다. 기존 API·ID·URL·낙관적 생성 표시·메타 목록 로딩을 유지한다. 임의 깊이 폴더나 OS 파일시스템을 추가한 것이 아니다.
- 공개 명칭은 캔버스와 노트(영문 Notes)로 통일했다. 헤더·홈·설치 앱 탐색·브라우저 탭·캔버스 설정/뒤로가기에 적용했다. `/blog`, `/canvas`와 내부 모듈 식별자는 유지한다.
- 작은 화면은 목록 열을 줄이고 탐색기를 접는다. 문서 높이의 공용 shell offset은 웹 헤더·설치 앱 하단 탐색·넓은 Windows 앱 측면 탐색을 고려한다. Markdown 문서 제목도 탭에 즉시 반영한다.

## 검증

| 검사 | 결과 |
| --- | --- |
| `cd flownote && yarn verify` | lint, TypeScript, production build 통과. 마지막 실행30.53초. 기존 pdf.js eval/큰 lazy chunk 경고는 남음 |
| `node flownote/tests/blog-bundle.test.mjs` | 실제 production 앱/노트 정적 import 경계 검사1개 통과. 기존 편집기·preview·KaTeX eager 의존성 없음 |
| staging `yarn e2e --retries=0` | **52/52 통과**, skip/retry 없음. 기존47개와 새 탐색기 CRUD/명칭/3화면 폭 검사5개 |
| 신규 E2E | 키보드 이름 변경·이동·재로드·폴더만 삭제 후 문서 보존·파일 삭제, 밝은/어두운 팔레트 일치, 390/820/1440px 가로 넘침·공개 명칭/탭 제목 검사 |
| 실제 staging 화면 검토 | 데스크톱 캔버스/노트, 모바일 목록/폴더/편집 화면 확인. 추가 브라우저 runtime error 없음. 합성 fixture만 사용하고 정리 요청 모두 성공 |
| 문서 링크·`git diff --check`·source guard | 모두 통과. 실행 소스가 바뀌면 운영 배포 차단 |

첫 staging 실행은49/52였다. 기존 '새 캔버스' 부분 일치가 새 폴더 버튼까지 찾아 실패했고 worker/account fixture 재시작으로 기존 복사/붙여넣기 검사도 연쇄 실패했다. 신규 명칭 검사는 숨겨진 모바일/데스크톱 버튼을 getByLabel로 함께 찾았다. 정확한 버튼 이름과 visible role을 사용해 수정했다. 두 번째 실행은51/52였고 파일명의 부분 일치가 열기·이름 수정·삭제 세 버튼을 함께 찾는 선택자도 바로잡았다. 그 이후 변경은 E2E 선택자뿐이며 실행 코드가 동일함을 byte 비교했다. cloud 파일만의15개 검사와 최종 전체52개를 다시 통과했다. 기능 assertion이나 timeout은 제거/완화하지 않았다. 첫 검증 명령은 저장소 루트에서 잘못 실행해 실패했으며, 이후 영향받는 `flownote/`에서 기본 명령으로 검증했다. 이 실패 상태에서는 운영 배포하지 않았다.

## staging-first 배포

명령: `node scripts/deploy-cloud.mjs release web`.

| 환경 | deployment ID | 상태 | immutable URL |
| --- | --- | --- | --- |
| staging | `dpl_6XUfLs5TPsx7XocQ3QhbWyd76eDV` | READY | https://flownote-react-staging-jh4h3nfxo-flownote-service.vercel.app |
| production | `dpl_DqBeD3emQRNMfxLLy5cWFtEvTqEu` | READY | https://flownote-react-8wi6eu13p-flownote-service.vercel.app |

staging/production source fingerprint: `3f4e3bfff9fef89d4e55e781739fe939834dd80fea3040c23e53d52153f872f5`.

운영 alias read-back이 위 production ID와 READY로 일치했다. 직전 정상 웹 `dpl_uuEi4AGvGVPXsW9tjhFtYPrx1Crf`를 롤백 기준으로 기록했으며 DB 변경은 없다. 공개 `/canvas`, `/blog`, gateway root 및 mobile config는200, 인증 없는 users/me와 notes summary는401을 확인했다. 배포 스크립트의 HTML/CSS/JS asset 검사도 통과했다. production 문서나 실제 계정 데이터에 쓰기 테스트를 하지 않았다.

백엔드 API·DB·서버 코드의 변경이 없어 Railway 서비스 재배포는 생략했다. 기존 사용자 변경은 되돌리지 않았고 commit/push는 이 요청에 포함되지 않아 실행하지 않았다. 클라우드 릴리스에는 현재 배포 기준인 인증/Canvas/PDF/Markdown 소스를 그대로 포함했다.

## 기록과 한계

- [기능 설계](../../docs/design-docs/canvas/workspace-explorer-design.md), [제품 행동](../../docs/product-specs/web-workspace-ux.md), [버그/검증 이력](../bugs/2026-10-20-workspace-palette-and-explorer.md).
- 최종 receipts: `/tmp/flownote-workspace-design-release-20261020/.release/`. 최초 실패 로그와 최종 screenshots: `/home/kwon/.local/state/flownote-codex/manual/workspace-design-20261020`. screenshots는 합성 사용자와 합성 문서이며 로컬 인증 정보/토큰은 저장하지 않았다.
- Android/Windows는 Chromium UA와 화면 크기로 검사했다. 실제 기기 설치 빌드나 임의 깊이 폴더, 파일시스템 동기화는 이번 범위에 포함하지 않는다.
