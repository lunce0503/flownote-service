# Android 설치 앱

## 목표

현재 웹에서 동작하는 기능과 편집기를 독립 설치 APK로 제공한다. `flownote-android/`의 Android 시스템 WebView가 공개 HTTPS 웹을 실행하며, 기능/API/동기화는 `flownote/`가 소유한다. Expo Go 앱(`flownote-mobile/`) 및 PC 제어용 Remote 앱(`apps/android/`)과는 별개다.

## 사용자 흐름

- 첫 실행은 로그인, 저장된 인증 세션이 있으면 홈으로 이동한다. 만료 또는 로그아웃 후에는 다시 로그인한다.
- 기존 웹 Flownote 헤더를 앱에서 렌더링하지 않는다. 하단 홈·노트·캔버스·플래너·전체 메뉴로 이동한다.
- 목록에서 항목을 선택하면 웹과 같은 노트/캔버스 상세 편집기로 진입한다. 구조화 노트의 전체 편집 기능도 웹 편집기를 그대로 사용한다.
- 전체 메뉴는 enabled 역량의 모든 루트 경로를 제공한다. 기존 development 역량은 ‘개발 중’으로 표시하며, 관리자 화면의 기존 서버 권한 검사를 유지한다. 이 메뉴 표시는 웹 서비스가 중지된 기능을 복구하거나 권한을 부여하지 않는다.
- 캔버스 상세에서는 하단 메뉴를 숨기고 목록 복귀 버튼과 기존 캔버스 도구를 제공한다.
- Android 뒤로가기는 앱 안의 이전 페이지로, 이력이 없으면 앱 종료로 이어진다.

## 디자인

아이보리 `#f7f3e8`, 검정 `#171714`, 밝은 표면 `#faf8f0`을 사용한다. 앱에서는 밝은 테마로 고정한다. 그리기 색상·문서 내용·상태 색상은 유지한다. 기존 데스크톱 브라우저의 헤더와 테마 정책은 유지한다.

## 기기 기능과 데이터

- Android 10(API 29) 이상. 휴대폰/태블릿, 회전, 시스템 키보드 inset을 지원한다.
- 파일 업로드는 시스템 문서 선택기를 사용하고 다중 이미지/PDF 선택을 전달한다.
- HTTPS 다운로드는 시스템 다운로드 관리자를, 32MB 이하 blob/data 내보내기는 문서 저장 선택기를 사용한다.
- 세션은 동일 origin의 WebView DOM 저장소에 유지한다. 기기 간 자료 동기화는 같은 계정과 기존 cloud API를 사용한다.
- 오프라인 첫 로드 실패 시 재시도 화면을 표시한다. 오프라인 완전 편집은 보장하지 않는다.
- cleartext/file URL 및 혼합 콘텐츠를 차단하며 native JavaScript interface를 노출하지 않는다. 서명키/서버 비밀값은 앱에 포함하지 않는다.

## 배포와 검증

Debug APK는 staging origin 및 별도 패키지 `.staging`을 사용하고 서명 release APK는 production origin을 사용한다. 배포는 `node scripts/deploy-cloud.mjs release web`으로 staging-first를 따른다. 설치 안내는 `/android.html`, APK는 `/downloads/flownote-1.0.0.apk`다.

웹 E2E에는 Android UA의 최초 로그인·세션 유지·전체 기능 메뉴·헤더 제거·휴대폰/태블릿 overflow·캔버스 상세 탐색을 포함한다. Android 빌드/lint/서명 검증과 실제 기기 WebView 실행 검증은 구분하여 기록한다.
