# Android 설치 앱

앱 **전체 → 설정 → 앱 동기화**에서 [오프라인 작업 공간](device-only-workspace.md)으로 전환할 수 있다. 서버 자료·지원 이미지를 먼저 기기에 보관하고 서버 저장·실시간 수신을 중지한다. 다시 켜면 기준본 이후 로컬/서버 변경을 자동 조정하고 선택되지 않은 충돌본을 복구 기록에 남긴다.

## 목표

현재 웹에서 동작하는 기능과 편집기를 독립 설치 APK로 제공한다. `flownote-android/`의 Android 시스템 WebView가 공개 HTTPS 웹을 실행하며, 기능/API/동기화는 `flownote/`가 소유한다. Expo Go 앱(`flownote-mobile/`) 및 PC 제어용 Remote 앱(`apps/android/`)과는 별개다.

## 사용자 흐름

- 첫 실행은 로그인, 저장된 인증 세션이 있으면 홈으로 이동한다. 만료 또는 로그아웃 후에는 다시 로그인한다.
- 기존 웹 Flownote 헤더를 앱에서 렌더링하지 않는다. 하단 홈·노트·캔버스·플래너·전체 메뉴로 이동한다.
- 목록에서 항목을 선택하면 웹과 같은 노트/캔버스 상세 편집기로 진입한다. 구조화 노트의 전체 편집 기능도 웹 편집기를 그대로 사용한다.
- 전체 메뉴는 enabled 역량의 모든 루트 경로를 제공한다. 기존 development 역량은 ‘개발 중’으로 표시하며, 관리자 화면의 기존 서버 권한 검사를 유지한다. 이 메뉴 표시는 웹 서비스가 중지된 기능을 복구하거나 권한을 부여하지 않는다.
- 캔버스 상세에서는 하단 메뉴를 숨기고 목록 복귀 버튼과 기존 캔버스 도구를 제공한다.
- Android 뒤로가기는 앱 안의 이전 페이지로, 이력이 없으면 앱 종료로 이어진다.
- 1.3.1(13100)부터 하단 네이티브 업데이트 바를 제거한다. **전체 → 설정 → 앱 업데이트**에서 버전·상태·업데이트 확인·설치·이력을 제공한다. 자동 다운로드/서명/해시/채널/롤백 방어와 OS 설치 확인은 유지한다. 기존1.3.0은 하단 바를 유지하며 새 웹 설정 카드에 기존 버튼 안내를 표시한다. 1.3.1은 staging129/129와 실제 Windows/Android 검증 뒤 운영/공개 완료했다.

## 디자인

아이보리 `#f7f3e8`, 검정 `#171714`, 밝은 표면 `#faf8f0`을 사용한다. 앱에서는 밝은 테마로 고정한다. 그리기 색상·문서 내용·상태 색상은 유지한다. 기존 데스크톱 브라우저의 헤더와 테마 정책은 유지한다.

## 기기 기능과 데이터

- Android 10(API 29) 이상. 휴대폰/태블릿, 회전, 시스템 키보드 inset을 지원한다.
- 파일 업로드는 시스템 문서 선택기를 사용하고 다중 이미지/PDF 선택을 전달한다.
- HTTPS 다운로드는 시스템 다운로드 관리자를, 32MB 이하 blob/data 내보내기는 문서 저장 선택기를 사용한다.
- 세션은 동일 origin의 WebView DOM 저장소에 유지한다. 기기 간 자료 동기화는 같은 계정과 기존 cloud API를 사용한다.
- 오프라인 첫 로드 실패 시 재시도 화면을 표시한다. 이전에 스냅샷한 개인 작업 자료는 앱 화면이 로드된 뒤 네트워크 없이 편집할 수 있지만, WebView 번들의 최초 로드와 스냅샷 계약 밖 기능까지 완전 오프라인으로 보장하지 않는다.
- cleartext/file URL 및 혼합 콘텐츠를 차단하며 native JavaScript interface를 노출하지 않는다. 서명키/서버 비밀값은 앱에 포함하지 않는다.

## 배포와 검증

Debug APK는 staging origin 및 별도 패키지 `.staging`을 사용하고 서명 release APK는 production origin을 사용한다. 이번 노트·사전 보류 릴리스는 target blog(canvas/web)를 staging-first로 같은 소스 배포했다. 설치 안내 `/android.html`, 운영 APK `/downloads/flownote-1.3.1.apk`, Android 양 채널 피드1.3.1(13100), [GitHub 공개 릴리스](https://github.com/lunce0503/flownote-service/releases/tag/android-v1.3.1)다. 기존 다운로드 링크는 유지한다. 실제 배포/서명/검증/물리 기기 한계는 [완료 기록](../../logs/report/2026-10-30-0316-note-app-release-dictionary-paused.md)이 소유한다. 자동 사전 조회는 준비 중이며 단어 보관·뜻/메모 편집·클라우드/OFF/ON은 유지한다.

웹 E2E에는 Android UA의 최초 로그인·세션 유지·전체 기능 메뉴·헤더 제거·휴대폰/태블릿 overflow·캔버스 상세 탐색을 포함한다. Android 빌드/lint/서명 검증과 실제 기기 WebView 실행 검증은 구분하여 기록한다.

## 1.2.0 자동 업데이트

- 시작·재개 시와 실행 중 1시간마다 확인한다. 자동 확인은 최소 15분 간격이다. 1.3.0까지 하단 네이티브 표시를 사용하고 1.3.1부터 설정에서 수동 확인·변경 내용·최근 이력·설치를 제공한다. 이 UI 이동은 자동 확인·다운로드 정책을 바꾸지 않는다.
- release는 production, debug는 staging 고정 HTTPS origin의 `/updates/<channel>/android.json`만 사용한다. 채널별 APK 이름과 패키지(`com.flownote.mobile` / `.staging`)를 분리한다.
- 앱에 고정한 RSA 공개키로 feed 서명을 검사하고 버전/versionCode·URL·크기·SHA-256을 확인한다. APK 패키지·버전·서명 인증서를 현재 설치와 대조하고 설치 직전 재검증한다. 다른 채널·패키지·서명 및 downgrade는 차단한다.
- 자동 다운로드는 앱 내부 `files/updates/`에 저장하며 부분 파일은 설치에 노출하지 않는다. 검증된 캐시를 재사용하고 실패 시 부분 파일을 제거해 다음 확인에서 재시도한다. 사용자 자료 폴더·WebView 저장소는 삭제하지 않는다.
- 사용자가 ‘설치’를 누른 뒤 필요하면 ‘이 출처 허용’을 켜고 Android 설치 확인을 완료한다. `REQUEST_INSTALL_PACKAGES`는 직접 APK 배포용이며 무인 설치를 의미하지 않는다.
- 비공개 `UpdateProvider`가 검증된 APK 한 파일만 OS 설치기에 read-only content URI로 전달한다. native JS bridge는 추가하지 않는다.
- 기존 1.0.0은 updater가 없으므로 1.1.0을 한 번 직접 설치한다. 기존 앱을 삭제하면 안 된다.

## 업데이트 설정 연결의 경계

`MainActivity`는 앱의 고정 HTTPS origin에서 `/settings`를 보고 있을 때, 사용자가 누른 main-frame GET `/__flownote_native__/updates`만 소비해 관리 창을 연다. iframe·사용자 동작 없는 스크립트·다른 origin·쿼리/fragment·임의 URL/파일/명령을 허용하지 않는다. 이 경로는 서버 API가 아니며 WebView 이력에 추가되지 않는다. `JavascriptInterface`나 호출 가능한 JS 객체는 없다. 네이티브가 버전/채널/상태 표시 데이터만 현재 동일 origin 문서에 주입하고 이벤트로 갱신한다. 웹 표시 데이터는 인증이나 서명 검증 근거가 아니다. 설치는 항상 네이티브 UI와 Android의 명시적 확인을 거친다.

새 웹은 기존 앱의 updater를 그대로 이용하는 안내를 제공한다. 새 바이너리는 설정 카드가 있는 웹을 staging에서 검증한 뒤 공개하고, 웹 롤백 시에도 이 카드와 고정 경로 계약을 보존한다. 번들 전체 로드가 불가능하면 공개 설치 안내에서 같은 서명의 APK를 직접 설치할 수 있다.

`node scripts/test-app-updates.mjs`는 서명·채널·버전·아티팩트 정책과 설정 진입 제약의 순수 JVM 검사를 포함한다. `settings-update-smoke.mjs`는 기존 설치본 호환·서명된 실제 staging feed 다운로드·캐시 재사용·시스템 설치 확인·초안/세션/이력 보존·설정 뒤로가기·WebView 반환 높이를 API35 에뮬레이터에서 확인한다. 통합 전 `--inject-candidate-settings`는 후보 컴포넌트를 현재 cloud 화면에 테스트 목적으로 마운트하며 실제 배포/통합 gate 통과로 간주하지 않는다. 통합 후 이 옵션 없이 새 staging 웹과 피드로 다시 실행한다.

CDP 한글 입력의 에뮬레이터는 AVD `hw.keyboard=yes`와 실제 QWERTY 구성을 요구한다. 화면 키보드 설정만 변경해도 하드웨어 키보드가 생기는 것은 아니다. soft/hard/IME 비활성화 단독 대조에서 순차 CDP의 중복이 재현돼 하드웨어 설정만으로 안정화됐다고 판단하지 않는다. Android 드라이버는 원래 세 다단계 조합·완성 입력 명령을 같은 연결 순서로 pipeline 전송한다. 일반 편집 영역 5회와 앱의 정확한 최종 문자·시작/종료 1회를 함께 검증하며 Windows의 순차 입력은 유지한다. 이 결과를 물리 키보드나 실제 Gboard의 한글 입력 통과로 표시하지 않는다.
