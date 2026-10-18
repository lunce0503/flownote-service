# Android APK 제작 및 배포

## 결과

Android 10 이상 휴대폰·태블릿에 독립 설치하는 Flownote 1.0.0 APK를 제작하고 production에 배포했다. Expo Go는 필요 없다.

- APK: https://flownote-react.vercel.app/downloads/flownote-1.0.0.apk
- 설치 안내: https://flownote-react.vercel.app/android.html
- 패키지: `com.flownote.mobile`
- 버전: `1.0.0`, versionCode `10000`
- minSdk: 29, target/compileSdk: 35
- 크기: 35,380 bytes
- SHA-256: `95fc7d67693b359331d79485453fe486e8bc8b559f6f99e53947bb16b09c126c`
- 서명: RSA 3072-bit, APK Signature Scheme v2 검증 성공
- 서명 인증서 SHA-256: `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`

## 구현 범위

`flownote-android/`에 Android 시스템 WebView 앱을 추가했다. 현재 Expo 클라이언트에는 웹 일부 기능만 구현되어 있어 웹 전체 기능 제공 요구는 웹과 동일한 화면·편집기·API를 공유하는 방식으로 구현했다. 기존 Expo 앱과 PC 제어용 `apps/android/`는 별개로 유지한다.

앱은 release에서 production 웹, debug에서 staging 웹을 연다. 기능 등록은 웹의 `capabilityManifest.tsx`를 그대로 사용한다. 노트와 BlockNote 편집기, 폴더, 캔버스와 PDF/이미지 가져오기, 플래너/일정/작업/일기, 소셜, 설정·피드백 및 기타 등록된 역량의 경로를 제공한다. 기존에 중지된 서버 기능이나 development 역량을 새로 활성화하는 작업은 포함하지 않는다. 개발 중인 항목에는 해당 표시를 두고 관리자 화면의 서버 권한 검사는 유지한다.

앱 UI는 UA marker `FlownoteAndroid/1.0.0`이 있는 세션에만 적용한다.

- 기존 Flownote 상단 헤더 제거.
- 아이보리 `#f7f3e8`와 검정 `#171714` 중심 테마 및 화면 폭에 맞춘 제목 크기.
- 홈·노트·캔버스·플래너·전체 하단 탐색, 전체 기능 메뉴, 설정/로그아웃.
- 최초 로그인, 세션 복원, 만료/로그아웃 후 로그인 복귀.
- 캔버스 상세에서는 하단 탐색을 숨기고 목록 복귀 및 기존 도구 제공.
- 시스템 뒤로가기로 메뉴 닫기, 전체 화면 종료, 이전 페이지 이동.
- Android 시스템 문서 선택기를 통한 다중 이미지/PDF 업로드.
- HTTPS 다운로드와 32MB 이하 blob/data 내보내기 저장 대화상자.

기존 웹 브라우저의 헤더와 테마 정책은 유지한다. 앱 전용 외관 외에는 기능 코드를 공유하므로 웹 업데이트가 앱에도 반영된다. 인터넷 연결이 필요하며 완전 오프라인 앱은 아니다.

## 보안 경계

- 고정 HTTPS origin만 내부에서 연다. 외부 HTTPS/mailto/tel은 별도 앱으로 연다.
- cleartext·file URL·혼합 콘텐츠 차단, native JavaScript interface 미노출.
- 시스템 선택기가 사용자가 고른 content URI만 업로드에 전달한다.
- release WebView 디버깅 비활성화, 클라우드 백업/기기 이전에서 앱 데이터 제외.
- 앱에는 서버 인증 비밀값이나 서명키를 포함하지 않는다.
- 운영 서명키와 비밀번호는 저장소 밖 운영자 전용 위치에 권한 600으로 보관했다. 업데이트 시 같은 키를 사용하고 versionCode를 증가시켜야 한다.

## 정적/빌드 검증

- `cd flownote && yarn lint`: 성공, 최종 경고 없음.
- `cd flownote && yarn typecheck`: 성공.
- `cd flownote && yarn build`: 성공.
- `cd flownote-android && ./gradlew assembleDebug assembleRelease lintRelease`: 성공.
- Android lint: 오류 0, 경고 0.
- `apksigner verify --verbose --print-certs`: 성공.
- `aapt dump badging/xmltree`: 패키지·버전·SDK·INTERNET 권한·backup/cleartext 비활성화 확인.
- `git diff --check`: 성공.

SDK와 Gradle은 APK 빌드 도구로 사용했다. 로컬 앱 서버·DB·Compose는 실행하지 않았다. Docker는 공식 Playwright 브라우저와 Android 에뮬레이터 실행 도구로만 사용했고, 앱 데이터 요청은 cloud staging HTTPS에만 전송했다.

## 실제 Android 런타임 검증

Android 15(API 35) x86_64 에뮬레이터에 debug APK(`com.flownote.mobile.staging`)를 설치하고 Android 시스템 WebView Chrome 124에서 검증했다. production 계정·데이터로 CRUD 테스트하지 않았다.

1. 계정 생성/로그인, 재로드 후 세션 유지 성공.
2. 기존 헤더 부재, 밝은 테마, 실제 412px viewport에서 수평 overflow 없음 확인.
3. Canvas에서 native 시스템 문서 선택기 열기 성공.
4. 시스템 뒤로가기로 이전 편집 화면 복귀 성공.
5. Fullscreen API 진입 후 시스템 뒤로가기로 종료 성공.
6. blob 캘린더 내보내기로 native 저장 대화상자 열기 성공.
7. 전체 기능 메뉴를 시스템 뒤로가기로 닫고 홈 유지 성공.

실행 스크립트와 화면 캡처는 로컬 `.release/`에 남겼다. 실제 사용자의 휴대폰·태블릿 및 제조사별 시스템 파일 선택기는 별도 현장 확인 대상이다.

## Cloud staging E2E

`node scripts/deploy-cloud.mjs release web`이 공식 Playwright 컨테이너에서 테스트 20개를 실행했고 최종 모두 통과했다(83.42초).

- Android UA 최초 로그인·세션 복원·헤더 제거·전체 기능 경로·로그아웃.
- 태블릿 탐색 터치 영역 및 캔버스 상세/목록 흐름.
- 구조화 노트의 서식 보존, 본문 편집, 제목 변경, 서버 저장 및 재로드.
- 인증·CORS·모바일 config, 캔버스 저장/재로드·색상·제목·PDF·복사/붙여넣기·모바일 도구·확대/이동·대용량 중복 저장.
- 플래너 격자/반응형/다중 요일, 인증된 동기화, 프로필 및 캔버스-플래너 제안.

스테이징 다운로드 APK의 HTTP 200과 SHA-256 일치도 확인했다.

## 배포 결과

- 소스 fingerprint: `d54a77e8f497ab1852da4fd8908040d768ac328e207d1f96bdb6cd7a6710d962`
- staging deployment: `dpl_7TaSk296Q7mPUq2ruWTeFDAcJGP3`, `READY`
- staging 검증 시각: `2026-10-17T12:10:12.102Z`
- production deployment: `dpl_AmKgREmqsTVFBBEvT8dpDeZ8ASEQ`, `READY`
- production URL: https://flownote-react-ihzw40c0t-flownote-service.vercel.app
- production 배포 시각: `2026-10-17T12:11:00.791Z`
- production smoke: 웹/정적 자산/API 공개 health/config 및 비인증 `/api/users/me` 상태 검증 성공.
- 공개 APK HTTP 200, MIME `application/vnd.android.package-archive`, 서명 검증한 로컬 APK와 SHA-256 일치.

스테이징 통과 기록과 같은 fingerprint를 확인한 후 production을 배포했다. APK도 스테이징과 production에서 같은 파일이다. 백엔드 구현 변경이 없어 Railway 서비스 재배포는 하지 않았다. 배포 스크립트가 관리하는 기존 환경별 공개 URL·Serverless 설정은 `--skip-deploys`로 적용했다.

## 검증 중 발견 및 처리

- 이전 Docker 실행이 만든 root 소유 테스트 결과 때문에 로컬 CI 실행이 EACCES로 중단됐다. 기존 결과는 `.release/test-results-before-android-20261017/`에 보관하고 해당 테스트 출력 폴더의 소유권을 복구했다.
- 호스트 브라우저 실행은 `libatk-1.0.so.0` 누락으로 실패했다. 저장소 배포 절차의 공식 Playwright 컨테이너 실행으로 전환했다.
- 최초 새 노트 테스트 fixture의 필수 `client_id` 누락을 수정해 실제 API 계약에 맞췄다.
- 캔버스 진입 후 첫 700ms의 일반 클릭이 터치 중복으로 무시되는 기존 버그를 발견해 초기 시각을 음의 무한대로 정정했다. 기존 팔레트/올가미/복사 테스트 통과로 확인했다. 상세: `logs/bugs/2026-10-17-canvas-first-click-suppression.md`.
- 실제 Android 화면 리뷰에서 큰 제목을 앱 전용 크기로 보정하고 메뉴 뒤로가기를 보완했다. 소스 변경 감지로 production이 차단된 중간 실행은 승격하지 않고, 최종 동일 소스로 전체 절차를 다시 통과했다.
- 배포 직후 한 차례 최초 페이지가 빈 화면으로 남는 timeout이 있었다. 원인은 확정하지 않았으며 새 브라우저 컨텍스트 3회에서 JS/네트워크 오류 없이 정상 진입했고, 이후 동일 소스의 최종 전체 검증도 통과했다. 재발 시 첫 진입의 asset 응답과 console 오류를 수집한다.

## 운영 및 롤백

설치 후 기존 웹 계정으로 로그인한다. 웹과 앱은 계정 기준의 서버 데이터를 공유하지만 브라우저와 앱의 로그인 저장소는 별개다.

웹 회귀 시 Vercel deployment history에서 직전 성공 production 배포로 rollback한다. 이 APK는 웹 기능을 공유하므로 웹 rollback이 앱 화면에도 반영된다. 네이티브 수정은 같은 서명키와 더 높은 versionCode로 새 APK를 배포한다. Play Store 등록은 이번 직접 APK 배포 범위에 포함하지 않는다.
