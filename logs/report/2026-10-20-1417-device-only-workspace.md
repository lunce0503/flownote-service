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
- 동시 source review에서 모드 전환 순간 남은 일기 저장 타이머가 반대 공간으로 향할 가능성을 확인했다. 페이지 수명에 고정된 모드·계정 fence를 추가하고 stale local page가 cloud diary PUT을 보내지 못하는 E2E를 추가했다. Android/Windows UA의 세션 없는 기기 재시작 검증도 추가했다.
- 첫 full gate는 추가 수정 source로 대체해야 하므로 해당 diagnostic Playwright container `250b167c819f`만 중지했다. 앱/DB/기존 사용자 자료는 중지·삭제하지 않았다. 첫 source는 production으로 승격하지 않는다.

## 상태

최종 source의 정적/단위 검사, 새 staging 배포·전체 71개 gate, 동일 source production 승격/read-back 진행 중. iOS TestFlight native 업로드와 이전 웹 기능 릴리스는 [별도 완료 보고](2026-10-20-1335-ios-ipados-web-parity.md)를 따른다. 실제 기기 OS 저장소 회수/강제 종료/공유 메뉴는 실기기 확인 대상이다.

제한·사용 흐름의 소유 기준은 [제품 사양](../../docs/product-specs/device-only-workspace.md)이며 API/DB 변경이 없어 Railway backend 바이너리 재배포는 불필요하다. 웹은 반드시 staging-first로 검증한다.
