# 원격 앱 초기 Android API 호환성

- 증상: 초기 `ANDROID_HOME=<SDK> ./gradlew testDebugUnitTest lintDebug assembleDebug`의 lintDebug에서 NewApi 4건 발생. SDK 29 최소 기기에서는 무조건 호출한 `WindowInsets.getInsets/Type`(API 30)와 `InputStream.readAllBytes`(API 33)가 런타임 호환되지 않는다.
- 원인: JDK 17 컴파일 가능 여부와 Android 기기 API 지원 여부를 혼동한 초기 화면/번들 설정 로딩 코드.
- 수정: `flownote-remote/android/app/src/main/java/com/flownote/remote/gesture/MainActivity.java`에서 API 30 이상에만 최신 insets를 사용하고 API 29에서는 기존 system-window inset을 사용한다. 설정 JSON은 byte buffer로 읽는다.
- 추가 검증 수정: 로컬 단위 테스트 컴파일의 `Files.readString` 미지원은 `Files.readAllBytes`+UTF-8로 교체했다.
- 검증: 같은 Gradle 명령 재실행 성공. Android 정책 단위 테스트 5건 통과, lintDebug 이슈 0건, debug APK 생성.
- 남은 수용 항목: Android 10/최신 Android 실기기에서 화면·회전·저장·권한 미요청 확인. 아직 카메라/실제 명령 구현은 없다.
