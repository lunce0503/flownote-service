# 앱 기기 전용 작업 공간

상태: 완료. 2026-10-20 14:26 KST 운영 배포와 읽기 전용 확인을 마쳤다. [결과 보고](../../../logs/report/2026-10-20-1417-device-only-workspace.md), [제품 기준](../../product-specs/device-only-workspace.md).

사용자는 서버 저장과 다른 기기 변경 수신을 모두 끄는 설정을 선택했다. 단순 Socket.IO 중단을 동기화 끄기로 표시하지 않는다.

## 범위와 결정

- 대상: 설치형 앱이 공유하는 `flownote` 웹 UI. iOS 1.1.0(4), Android 1.1.0, Windows 1.1.1 셸은 변경 없이 새 웹 기능을 받는다.
- 계정·기기·웹 환경별 독립 IndexedDB 작업 공간을 사용한다. 처음에는 비어 있으며 클라우드 자료를 자동 복제하지 않는다. 서버 원본은 변경하지 않는다.
- 노트/폴더, 캔버스/폴더/이미지, 플래너의 할 일·시간표·일기를 기존 UI와 요청/응답 계약으로 기기에 저장한다.
- 동기화를 다시 켜도 기기 전용 자료는 보존하지만 자동 업로드/병합하지 않는다. 다시 끄면 기존 기기 자료로 돌아온다.
- 로컬 저장 transaction 완료 전에 저장 성공을 반환하지 않는다. 저장 공간 부족/차단은 오류다. 기기 자료 백업 내보내기를 제공한다.
- 기기 모드에서는 실시간 연결, API 요청과 서버 필요 기능을 차단한다. 로그인 최초 진입·앱 화면 다운로드·네이티브 앱 업데이트까지 오프라인으로 만든다는 의미는 아니다.
- 앱 삭제/사이트 데이터 삭제/OS 저장 공간 정리는 로컬 자료를 잃게 할 수 있다. 백업 및 재로그인/공유 기기 주의를 명시한다.
- 설정 전환은 설정 화면에서 확인 후 전체 페이지 이동으로 수행한다. 초안과 재시도 큐도 클라우드와 기기 namespace를 분리해 나중에 전송되지 않게 한다.

## 검증

1. 모델 단위 테스트: CRUD, 계정 분리, revision, 폴더 연결, canvas delta/중복 저장, 지원 밖 요청 차단.
2. 웹 lint/typecheck/build 및 기존 테스트.
3. 클라우드 staging Chromium/WebKit: 설정 전환, 서버 요청 0건, 노트/캔버스/플래너 저장·재시작 복원, 계정 분리, 재활성화 후 서버 불변/기기 자료 보존.
4. 전체 staging gate 통과 후 같은 소스 production 승격, 비변경 조회 확인.

## 미포함

서버 자료 전체 다운로드, 자동 양방향 병합, 네이티브 완전 오프라인 최초 실행, 서버 AI/소셜/계정 관리의 로컬 구현은 포함하지 않는다. 이 제한은 UI와 제품 기준에 표시한다.

## 완료 근거

- 단위 46/46, lint/typecheck/build, targeted Chromium/WebKit 6/6, 전체 cloud staging 71/71 통과.
- 계정별 자료, 저장소 차단/quota 오류, 오래된 local page의 cloud PUT 차단, 서버 복귀 후 불변과 기기 원본 복원 검증.
- 추가 staging 실 로그인 복원, local PNG 이미지/두 반복 일정 저장·reload/API 0, 390/1024px WebKit UI 확인.
- source `1eba6df8de58dc8190976cb3ae8932550efdfe24`, fingerprint `1ada8ca607405055217ef91fcee8f664b2e54742098000e9615ccf460da4f8f6`. staging `dpl_DQCn9zJfXDF6nPevJBHSMDCPjYhK`, production `dpl_4ynCrQ8r42sah8WHpkmHVzYQiT9r` READY.
- 운영 HTML 200/asset의 mode marker/비인증 API 401, 실제 WebKit 설정 표시와 서버 요청 0을 읽기 전용 확인. production CRUD 없음. native 변경과 backend API/DB 변경이 없어 재빌드/재배포하지 않았다.
