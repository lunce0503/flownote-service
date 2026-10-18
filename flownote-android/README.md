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
- 앱 식별: WebView UA의 `FlownoteAndroid/1.0.0` marker.
- 기존 Flownote 헤더 대신 앱 전용 하단 탐색과 전체 기능 메뉴 사용.
- 파일: 시스템 문서 선택기, HTTPS DownloadManager 및 32MB 이하 blob/data 내보내기 저장 선택기.
- 보안: HTTPS 고정 origin, 외부 링크는 별도 앱, 파일 URL·혼합 콘텐츠 차단, JavaScript native bridge 없음, 백업 비활성화, release WebView 디버깅 비활성화.

## 배포

1. 정적 검사와 `assembleDebug lintRelease`, 서명 release APK 검증을 수행한다.
2. release APK를 `flownote/public/downloads/flownote-1.0.0.apk`에 복사한다.
3. `node scripts/deploy-cloud.mjs release web`으로 staging E2E 통과 후 같은 소스를 production에 배포한다.
4. `/android.html` 안내와 `/downloads/flownote-1.0.0.apk`의 HTTP 상태·SHA-256을 확인한다.

사용자 동작 사양은 [Android 앱 사양](../docs/product-specs/android-app.md)을 따른다.
