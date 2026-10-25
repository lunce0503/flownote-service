# Apple Pencil 호버 표시 최소화

상태: 완료 — application manage에서 2026-10-25 19:11:12 KST에 전체 클라우드 97/97, 기존 Android/Windows 설치본 검사 및 staging-first 동일 소스 운영 배포·최종 read-back을 완료했다. 물리 iPad/Pencil 확인은 미완료다.

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

## 앱 관리 검증 진행 (2026-10-25 Asia/Seoul)

- 실행 소스는 운영 기준 bee2559에 표시 변경 e2e99e7, Windows 설치본 검사 강화 7bfbc7c 및 입력 안정화 45dcaa0를 반영한 격리 worktree다. branch codex/pencil-hover-20261025를 origin에 push했다. 공유 HEAD/index와 flownote-remote 등 무관 변경은 보존했다.
- 실행 소스의 yarn verify와 포인터/Pencil 단위 검사 6/6 통과. 첫 컨테이너 검사는 읽기 전용 의존성 아래 TypeScript .tmp, 다음 검사는 Vite .vite-temp 쓰기로 EROFS 중단됐다. 두 캐시 경로만 tmpfs로 분리한 동일 명령에서 ESLint/TypeScript/Vite build와 단위 검사 모두 통과했다. 앱 서버/Compose는 실행하지 않았다.
- Android 기존 staging 1.3.0(13000) APK의 설치 바이트 SHA-256을 서명 feed와 대조했다. 실제 WebView에서 신규 entry hash, 4×4px 원, 빈 텍스트/SVG 부재, 입력 관통, 정상 background 후 process restart의 로그인/localStorage probe 보존을 확인했다. 하드웨어 필기 검증은 아니다.
- Windows 기존 1.3.1 installer/portable를 실제 Windows CI에 설치하고 updater 다운로드/cache와 기존 1.0.0 업그레이드 profile 보존을 검증했다. 첫 run 40182649878은 installer 통과 후 portable의 모의 pen 표시 대기에서 실패했다. 도구막대의 real mouse leave와 별도 pen 이벤트가 겹치지 않도록 기존 WebKit 검사와 같은 실제 mouse 정착 + 두 RAF를 추가했다. 제품 입력 로직·표시 검사를 약화하지 않았다. 최종 run [40182833048](https://github.com/lunce0503/flownote-service/actions/runs/40182833048)은 두 설치본 모두 신규 entry hash, 4px 원/배지 부재, reload/restart 로그인·localStorage probe 보존을 통과했다.
- 초기 staging 전체 검사는 위 검사 코드 보완 때문에 담당 Playwright 컨테이너만 중단했다. 현재 READY staging dpl_FtxV1T34M7svXyhj9Vagb4eTYsyQ를 재사용해 최종 소스의 전체 gate를 처음부터 재검사한다. 실패/중단 결과를 production 통과 근거로 사용하지 않는다.
- 검증 entry: /assets/index-C0iRdLxX.js, SHA-256 732264a1dae9bf83edc8d356206115b66209f1d855d8d8b574cdc8a561547ed8. 최종 native 검사와 전체 gate는 동일한 staging runtime을 사용한다.
- iOS/iPadOS 1.3.0(8), Android 1.3.0(13000), Windows 1.3.1은 기존 버전이며 이번에 새 바이너리로 릴리스했다고 표시하지 않는다. 네이티브 실행·권한·브리지 변경이 없어 패키지 재발행/EAS 제출을 생략한다. Railway backend/Expo Go/모바일 정적 실행 소스도 동일하여 해당 서비스 재배포를 생략한다. 기존 서명 feed와 다운로드 바이트는 운영 승격 뒤 다시 확인한다.

최종 전체 gate 및 production read-back은 아래 완료 기록으로 확정한다.

## 완료 기록 (2026-10-25 19:11:12 Asia/Seoul)

- 최종 전체 클라우드 gate: 97/97 통과, 9.9분. 2026-10-25 19:08:51 KST에 검증 receipt를 생성했다. WebKit 390/820/1024px 호버와 Chromium 390/820px pen/touch 실제 프로토콜 접촉, 도구 전환, 4px 원·배지 부재, 기존 필기 보존·추가 저장·재로드, 축 잠금·복수 접촉·핀치 및 iOS WebKit 동기화/내보내기 회귀를 포함한다.
- 앱 설치본 검사를 운영 승격 전에 완료하기 위해 표준 scripts/deploy-cloud.mjs의 staging web → production web 단계로 나눠 실행했다. 재검사에는 FLOWNOTE_RELEASE_RESUME_DEPLOYMENTS로 기존 READY staging을 재사용했다. 소스 경로는 /tmp/flownote-pencil-hover-20261025, root guard는 43bfba46b9a3b9eeef145541661774cb5a86c06ba5fcfc7142ef20dcebb79e4c다.
- staging: dpl_FtxV1T34M7svXyhj9Vagb4eTYsyQ, READY. https://flownote-react-staging-hctko8r7i-flownote-service.vercel.app
- production: dpl_5xn37siXdqQPsdpDUg7ztxmyHwSd, READY. https://flownote-react-mi0xaqoxy-flownote-service.vercel.app — 운영 alias https://flownote-react.vercel.app. 배포·smoke 완료 2026-10-25 19:10:08 KST.
- 두 receipt의 동일 실행 소스 지문: 80cc23b3748d67088c8e1ded96e5effd93364d86abaccb5893670e4a87652048. 최종 staging entry는 설치본·WebKit 검증 당시의 SHA-256과 다시 대조해 동일함을 확인했다.
- 최종 read-back: 두 alias의 실제 deployment ID·READY·entry 200, 두 환경 × 두 채널 × Android/Windows 총 8개 feed의 원본 바이트·RSA 서명·버전·no-store 유지, Android APK 응답 바이트 수/SHA-256, Windows 공개 아티팩트 HEAD 크기를 확인했다. Windows 전체 다운로드/hash·캐시는 실제 설치본 CI에서 확인했다. staging/production gateway 200, 비로그인 me 401, 모바일 config의 환경별 웹 origin 일치도 통과했다. production에는 테스트 계정·문서를 작성하지 않았다.
- 기존 앱을 완전히 종료한 뒤 온라인에서 다시 열면 새 공통 웹을 받는다. 재설치·앱 버전 증가·새 EAS/TestFlight 제출은 필요하지 않다. 실제 iOS WKWebView 앱 재시작이나 물리 iPad/Pencil 호버·가독성·손바닥 거부는 실기기 미연결로 미검증이다. WebKit 에뮬레이션을 물리 기기 확인으로 표시하지 않는다.
- 검증용 Android 에뮬레이터와 담당 브라우저 컨테이너는 종료했다. 기존 무관 서비스에는 조치하지 않았다. 이전 운영 dpl_B6ro9y6THTGH8XVHkgdUnyxtnJ65는 READY로 남아 웹 복구가 가능하다.
- 실행 로그: /tmp/flownote-pencil-hover-verify-complete.log, /tmp/flownote-pencil-hover-android.log, /tmp/flownote-pencil-hover-windows-final.log, /tmp/flownote-pencil-hover-staging-final.log, /tmp/flownote-pencil-hover-production.log, /tmp/flownote-pencil-hover-production-readback.log. 비밀값·원본 사용자 자료는 기록하지 않았다.
- 최종 기록 변경은 logs/report/만 수정하므로 추가 Docker 빌드·클라우드 재배포는 생략하고 문서 존재·지문/ID·상태·diff를 검증한다. 실행 코드의 배포·검증 상태는 위 receipt가 소유한다.
