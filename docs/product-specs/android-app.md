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

Debug APK는 staging origin 및 별도 패키지 `.staging`을 사용하고 서명 release APK는 production origin을 사용한다. 배포는 `node scripts/deploy-cloud.mjs release web`으로 staging-first를 따른다. 설치 안내는 `/android.html`, 현재 APK는 `/downloads/flownote-1.2.0.apk`다. 이전 다운로드는 이력과 기존 링크 호환을 위해 유지한다.

웹 E2E에는 Android UA의 최초 로그인·세션 유지·전체 기능 메뉴·헤더 제거·휴대폰/태블릿 overflow·캔버스 상세 탐색을 포함한다. Android 빌드/lint/서명 검증과 실제 기기 WebView 실행 검증은 구분하여 기록한다.

## 1.2.0 자동 업데이트

- 시작·재개 시와 실행 중 1시간마다 확인한다. 자동 확인은 최소 15분 간격이며 하단 네이티브 업데이트 표시에서 수동 재시도·변경 내용·최근 이력·설치를 제공한다.
- release는 production, debug는 staging 고정 HTTPS origin의 `/updates/<channel>/android.json`만 사용한다. 채널별 APK 이름과 패키지(`com.flownote.mobile` / `.staging`)를 분리한다.
- 앱에 고정한 RSA 공개키로 feed 서명을 검사하고 버전/versionCode·URL·크기·SHA-256을 확인한다. APK 패키지·버전·서명 인증서를 현재 설치와 대조하고 설치 직전 재검증한다. 다른 채널·패키지·서명 및 downgrade는 차단한다.
- 자동 다운로드는 앱 내부 `files/updates/`에 저장하며 부분 파일은 설치에 노출하지 않는다. 검증된 캐시를 재사용하고 실패 시 부분 파일을 제거해 다음 확인에서 재시도한다. 사용자 자료 폴더·WebView 저장소는 삭제하지 않는다.
- 사용자가 ‘설치’를 누른 뒤 필요하면 ‘이 출처 허용’을 켜고 Android 설치 확인을 완료한다. `REQUEST_INSTALL_PACKAGES`는 직접 APK 배포용이며 무인 설치를 의미하지 않는다.
- 비공개 `UpdateProvider`가 검증된 APK 한 파일만 OS 설치기에 read-only content URI로 전달한다. native JS bridge는 추가하지 않는다.
- 기존 1.0.0은 updater가 없으므로 1.1.0을 한 번 직접 설치한다. 기존 앱을 삭제하면 안 된다.
