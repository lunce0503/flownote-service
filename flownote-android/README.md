# Flownote Android

Android 10 이상용 독립 설치 APK. `com.flownote.mobile` 패키지로 설치하며 Expo Go가 필요 없다.

웹 전체 역량과 편집기를 유지하기 위해 Android 시스템 WebView에서 배포된 `flownote/`를 실행한다. 웹이 갱신되면 앱에도 같은 기능이 반영된다. 네트워크 연결이 필요하며 기존 웹 세션 저장 및 로컬 초안 정책을 그대로 사용한다. `apps/android/`는 별개의 Flownote Remote 앱이므로 이 앱과 혼동하지 않는다.

## 빌드

Java 17, Android SDK 35, Build Tools 35.0.0을 사용한다.

```bash
./gradlew assembleDebug lintRelease
# 운영 서명키와 비밀번호는 환경에만 주입한다.
./gradlew assembleRelease
```

운영 서명 설정은 `FLOWNOTE_ANDROID_KEYSTORE`, `FLOWNOTE_ANDROID_SIGNING_PASSWORD`와 별칭 `flownote-android`를 사용한다. 서명키를 잃으면 기존 설치를 유지한 업데이트가 불가능하므로 운영자 전용 저장소에 보관하고 저장소·APK·보고서에 넣지 않는다.

- debug: 패키지 `com.flownote.mobile.staging`, staging 웹에 연결.
- release: 패키지 `com.flownote.mobile`, production 웹에 연결.
- 앱 식별: WebView UA의 `FlownoteAndroid/<BuildConfig.VERSION_NAME>` marker.
- 기존 Flownote 헤더 대신 앱 전용 하단 탐색과 전체 기능 메뉴 사용.
- 파일: 시스템 문서 선택기, HTTPS DownloadManager 및 32MB 이하 blob/data 내보내기 저장 선택기.
- 보안: HTTPS 고정 origin, 외부 링크는 별도 앱, 파일 URL·혼합 콘텐츠 차단, JavaScript native bridge 없음, 백업 비활성화, release WebView 디버깅 비활성화.

## 배포

1. 정적 검사와 `assembleDebug lintRelease`, 서명 release APK 검증을 수행한다.
2. release APK를 `flownote/public/downloads/flownote-1.1.0.apk`에 복사한다. staging debug APK는 `flownote-1.1.0-staging.apk`로 분리한다.
3. `node scripts/deploy-cloud.mjs release web`으로 staging E2E 통과 후 같은 소스를 production에 배포한다.
4. `/android.html` 안내와 `/downloads/flownote-1.1.0.apk`의 HTTP 상태·SHA-256을 확인한다.

## 자동 업데이트

1.1.0/versionCode 11000부터 네이티브 `AppUpdater`가 시작/재개/1시간 주기에 새 APK를 자동 다운로드한다. 무료 모바일 계정/Expo와 무관하며 직접 배포 APK 전용이다. OS 설치 확인 및 ‘이 출처 허용’은 사용자가 수행한다. 기존 앱을 삭제하지 않고 같은 서명키로 설치하면 WebView 로그인·초안을 유지한다. 1.0.0은 updater가 없어 한 번 수동 설치가 필요하다.

저장소 루트에서 서명키 경로를 `FLOWNOTE_UPDATE_SIGNING_KEY` 환경에 넣고 `node scripts/sign-app-update.mjs android staging 1.1.0 flownote/public/downloads 11000` 및 production을 실행한다. feed 서명키는 APK 서명키와 별개이며 앱에 공개키를 고정한다. 상세 채널·파일 검증 계약은 [소유 사양](../docs/product-specs/android-app.md#110-자동-업데이트)을 따른다.

`node scripts/test-app-updates.mjs`는 Node updater 및 순수 JVM 정책 테스트다. debug에만 `-PtestVersionCode=10001 -PtestVersionName=1.0.1`로 업데이트 이전 버전을 만들어 cloud staging에서 시험할 수 있다. release 작업은 test version override를 거부한다.

사용자 동작 사양은 [Android 앱 사양](../docs/product-specs/android-app.md)을 따른다.
