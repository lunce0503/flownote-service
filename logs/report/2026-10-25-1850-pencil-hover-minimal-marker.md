# Apple Pencil 호버 표시 최소화

상태: 구현·정적 검증 완료, application manage에 기존 앱 반영 검증과 staging-first 운영 배포를 인계한다. 실제 배포 완료와 구분한다.

## 요청과 원인

사용자는 Apple Pencil 호버 시 도구명·아이콘과 큰 원이 필기를 가린다고 보고하고 이름·아이콘 제거 및 매우 작은 원을 요청했다. 기존 CanvasToolPointer는 위치에 16 CSS px 도형과 2px 테두리·바깥 2px 링, 별도 도구 아이콘·텍스트 배지를 표시했다.

## 변경

- 공유 웹 CanvasToolPointer의 따라다니는 도구명·아이콘 배지를 제거했다. 위치 표시는 지름 4 CSS px, 1px 반투명 테두리의 원 하나로 통일하고 바깥 링·그림자를 제거했다. viewport 좌표이므로 캔버스 확대율에 따라 커지지 않는다.
- 상단 도구막대의 현재 도구 이름·접근성 상태와 Pencil 두 번 탭 도구 전환을 유지한다. 표시 모델과 편집 입력·저장·복수 접촉·핀치 처리 코드는 수정하지 않았다.
- 기존 WebKit 390/820/1024px 호버 및 Chromium 390/820px 접촉 회귀 검사를 새 표시 계약으로 갱신했다. 4×4px, 빈 텍스트·SVG 없음, 입력 관통과 좌표·필기 저장·재로드·축 잠금·부분 해제·핀치 검사는 유지한다.
- 소유 문서: docs/design-docs/canvas/canvas.md 및 docs/product-specs/ios-ipados-testflight.md.

## 소스와 검증

- 영향: flownote/ 공유 웹 표시. 네이티브 브리지·권한·버전·서명 feed·backend 실행 소스 변경 없음.
- 운영 alias를 조회해 dpl_B6ro9y6THTGH8XVHkgdUnyxtnJ65 READY와 기존 운영 보고서의 일치를 확인했다.
- 해당 운영 소스 bee2559 기반 격리 worktree /tmp/flownote-pencil-hover-20261025, branch codex/pencil-hover-20261025에 요청 관련 5파일만 반영했다. 공유 HEAD/index와 다른 작업은 유지한다.
- flownote/에서 yarn verify: ESLint, TypeScript, Vite production build 통과. 기존 PDF.js eval 및 bundle 크기 경고는 남아 있다.
- node --test flownote/src/widgets/CanvasWidget/InfiniteCanvas/model/canvasToolPointer.test.mjs flownote/src/features/canvas/model/applePencilTool.test.mjs: 6/6 통과.
- git diff --check 통과.

## 앱 관리 인계와 완료 기준

기존 application manage / flownote 앱 관리 세션 01a04858-b6df-7613-91da-c92a37955657에 docs/operations/app-release-handoff.md 절차로 인계한다. 현재 사용자 요청과 이전의 앱 배포 기본 경로 지정에 근거한다. 기존 iOS/iPadOS 1.3.0(8), Android 1.3.0, Windows 1.3.1은 공유 HTTPS 웹을 사용하므로 새 native 실행 변경 없이 반영 가능한지 담당 세션에서 확인한다.

- 같은 격리 소스를 검토하고 실제 staging 웹에 node scripts/deploy-cloud.mjs release web로 배포·전체 cloud gate·같은 지문 운영 승격을 진행한다. 앱 담당이 실행하므로 주 세션에서 중복 배포하지 않는다.
- 새 설치 패키지가 필요 없으면 불필요하게 버전을 올리지 않고 기존 앱의 웹 갱신·reload/재시작·자료 보존을 확인한다. 설치본 검증과 브라우저 UA 검증은 구분한다.
- staging/production deployment ID·동일 소스 지문·4px 원 및 텍스트/아이콘 부재·필기/지우개/두 번 탭/손가락 이동/핀치·저장 회귀 결과를 기록한다.
- 실제 물리 iPad/Pencil을 연결하지 않았다면 호버 지원·가독성·손바닥 거부는 실기기 확인 미완료로 명시한다.
- backend 실행 산출물이 없어 Railway backend/Expo Go/모바일 정적 서비스 재배포를 생략한다. 기존 native updater feed는 보존한다. 문제가 생기면 이전 READY 웹 배포로 복구하며 계정·기기 자료를 삭제하지 않는다.

이 문서 아래에 담당 배포 결과와 최종 read-back을 추가한다.
