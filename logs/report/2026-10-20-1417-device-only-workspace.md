# 앱 동기화 끄기 · 기기 전용 작업 공간

2026-10-20 KST. iOS 웹 기능 공유 릴리스에 추가된 사용자 요청이다. 사용자는 서버 저장과 실시간 수신을 모두 중지하는 방식을 명시 선택했다.

## 구현

- `flownote` 설치형 앱 UI의 설정에 동기화 스위치/전환 확인, 기기 전용 표시, JSON 백업을 추가했다. iOS/iPadOS 1.1.0(4), Android 1.1.0, Windows 1.1.1이 공유 웹 소스로 제공받으며 native 재빌드 대상은 아니다.
- 별도 IndexedDB 원본을 계정별로 보관한다. 처음에는 빈 공간이며 클라우드 자료를 자동 복제하지 않는다. 다시 켜면 기존 서버 자료, 다시 끄면 기존 기기 자료로 돌아온다. 자동 업로드/병합/가져오기는 지원하지 않는다.
- 노트/폴더, Canvas/폴더/이미지, 플래너 할 일·시간표·일기를 기존 편집기와 API 소비 계약으로 로컬 처리한다. 서버 fallback 없이 API/fetch와 두 Socket.IO 연결을 차단한다. 설정·프로필·피드백 및 서버 필요 라우트는 이용 제한을 표시한다.
- 초안/재시도 DB와 ID를 분리하고, 기기 전용 ID는 cloud 전송 경계에서도 거부한다. 페이지의 시작 모드와 계정을 고정하여 모드 전환 중 오래된 자동 저장이 반대편에 저장되지 않도록 한다. 기기 자료가 있는 계정으로 재로그인하면 새 페이지로 진입한다.
- transaction 완료 후에만 로컬 성공 응답을 반환한다. 계정 변경 중 응답, 저장소 차단·quota 실패를 성공으로 숨기지 않는다. 기기 자료는 암호화 금고가 아니며 앱/사이트 데이터 삭제·OS 정리로 잃을 수 있다는 주의를 표시한다.

## 검증 이력

- TDD: 순수 로컬 모델 파일이 없을 때 실패 확인 후 구현. 현재 전체 src 단위 46개 통과, lint/typecheck/production build 통과. 새 fence 추가 후 다시 검사한다.
- 첫 source `9e0b2972abb6ac87497f2f8e0c3b771857a62c0e`의 staging immutable URL `https://flownote-react-staging-r9mqrv5y4-flownote-service.vercel.app`에서 targeted Chromium/WebKit 실행. 노트/Canvas pointer/플래너 저장·reload, API 트래픽 0, 백업 JSON, 서버 모드 복귀 시 불변/기기 원본 재복원은 양 엔진 모두 통과했다.
- 저장소 실패/계정 분리 시나리오는 제품이 올바른 오류를 표시했지만 테스트가 두 `role=alert`를 하나로 선택해 strict locator 오류가 났다. 기존 오류 표시를 약화하지 않고 작업 오류 컨테이너로 selector를 한정했다.
  실행 명령은 진단용 Playwright 컨테이너 안의 `yarn e2e device-only.spec.ts --retries=0`였다. 수정 후 같은 명령 6/6으로 확인했다. 실패한 source를 production으로 승격하지 않았다.
- 동시 source review에서 모드 전환 순간 남은 일기 저장 타이머가 반대 공간으로 향할 가능성을 확인했다. 페이지 수명에 고정된 모드·계정 fence를 추가하고 stale local page가 cloud diary PUT을 보내지 못하는 E2E를 추가했다. Android/Windows UA의 세션 없는 기기 재시작 검증도 추가했다.
- 첫 full gate는 추가 수정 source로 대체해야 하므로 해당 diagnostic Playwright container `250b167c819f`만 중지했다. 앱/DB/기존 사용자 자료는 중지·삭제하지 않았다. 첫 source는 production으로 승격하지 않는다.

## 상태

추가 확인: 최종 `1eba6df8de58dc8190976cb3ae8932550efdfe24`에서 targeted Chromium/WebKit 6/6(1분), 전체 source 단위 46/46, lint/typecheck/build 성공. 별도 staging 검사에서 기기 로그아웃→실제 재로그인→모드/노트 보존, PNG 파일 local 저장→reload, 두 반복 일정 저장→reload 및 API 트래픽 0을 확인했다. WebKit 390px/1024px 설정 화면을 직접 검토했고 가로 넘침이 없었다. 이것은 네이티브 OS 강제 종료/공유 시트 검증을 대체하지 않는다.

최종 staging: 전체 71/71(6.1분), `2026-10-20T05:25:04.909Z`, `dpl_DQCn9zJfXDF6nPevJBHSMDCPjYhK`, `https://flownote-react-staging-g9wsfkywh-flownote-service.vercel.app`, READY. source fingerprint `1ada8ca607405055217ef91fcee8f664b2e54742098000e9615ccf460da4f8f6`. snapshot `/dev/shm/flownote-device-only-final-release-20261020`는 검증 중 수정하지 않았다.

완료: 같은 fingerprint/source의 production `dpl_4ynCrQ8r42sah8WHpkmHVzYQiT9r`, `https://flownote-react-4m9swycse-flownote-service.vercel.app`, READY, `2026-10-20T05:26:01.692Z` (14:26 KST). `vercel inspect`로 운영 별칭 `flownote-react.vercel.app`의 ID 일치를 확인했다. `/` 200, 실제 배포 JS의 iOS/mode marker, 비인증 same-origin users/me 401 확인. 별도 운영 WebKit은 합성 캐시 사용자로 설정 화면만 열어 기기 전용 switch/서버 기능 비활성/헤더 없음/API 요청 0을 확인했다. 운영 계정 생성·CRUD·DB 변경은 하지 않았다.

정적 명령: `flownote` 안에서 `yarn lint`, `yarn typecheck`, `yarn build`; 전체 src `.test.mjs`를 `node --experimental-strip-types --test`로 실행했다. 배포는 `FLOWNOTE_RELEASE_SOURCE_ROOT=/dev/shm/flownote-device-only-final-release-20261020 node scripts/deploy-cloud.mjs staging web`, 전체 통과 후 같은 root의 `production web` 순서였다. 새 로컬 앱 서버/Compose는 실행하지 않았다. 문서·계획·보고서의 후속 정리는 실행 artifact를 바꾸지 않는다.

iOS TestFlight native 업로드와 이전 웹 기능 릴리스는 [별도 완료 보고](2026-10-20-1335-ios-ipados-web-parity.md)를 따른다. 제출 `bdf2a638-d95a-4774-9d32-7b47889eb27f` FINISHED를 다시 조회했다. Apple의 처리/테스터 그룹과 실제 기기 설치는 별도이며 OS 저장소 회수/강제 종료/공유 메뉴는 실기기 확인 대상이다. 이전 1.0.0 앱은 TestFlight에서 1.1.0(4)로 업데이트해야 새 웹 셸을 사용한다.

제한·사용 흐름의 소유 기준은 [제품 사양](../../docs/product-specs/device-only-workspace.md)이며 API/DB 변경이 없어 Railway backend 바이너리 재배포는 불필요하다. 웹은 반드시 staging-first로 검증한다.
