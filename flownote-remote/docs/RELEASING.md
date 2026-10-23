# GitHub 앱 릴리스

배포 대상은 `lunce0503/flownote-remote-service`다. 독립 저장소 루트에는 `android/`, `src/`, `config/`, `vendor/`와 `.github/workflows/release.yml`이 있다. 상위 Flownote 서비스 저장소 전체나 다른 앱/인증 파일을 업로드하지 않는다.

## 서명키

- Android alias: `flownote-remote`, PKCS12/RSA 3072.
- GitHub Actions secrets: `FLOWNOTE_REMOTE_KEYSTORE_BASE64`, `FLOWNOTE_REMOTE_SIGNING_PASSWORD`.
- 로컬 복구 사본: 운영자 전용 저장소 밖 경로에 keystore/password를 보관한다. 키나 비밀번호를 Git·보고서·release artifact에 넣지 않는다. 같은 키를 유지해야 기존 설치를 업데이트할 수 있다.
- Gradle은 `FLOWNOTE_REMOTE_KEYSTORE`(파일 경로), `FLOWNOTE_REMOTE_SIGNING_PASSWORD` 환경 변수가 있을 때만 release 서명을 설정한다. 공개 릴리스 workflow는 secret 누락·서명 검증 실패 시 게시하지 않는다.
- Windows는 자체 포함 portable ZIP이며 현재 Authenticode 서명·설치 프로그램·자동 업데이트는 없다.

## 소스 검증

1. `Directory.Build.props`의 Version과 `android/app/build.gradle.kts`의 versionName을 일치시키고 Android versionCode를 증가시킨다.
2. `release-notes/v<version>.md`를 작성한다. 준비 상태인 기능은 제공한다고 설명하지 않는다.
3. `node scripts/check-release.mjs`, `dotnet run --project tests/Flownote.Remote.Checks -c Release`, Android의 `./gradlew testDebugUnitTest lintRelease assembleRelease`를 실행한다.
4. 공개 소스에 서명 파일·비밀값·빌드 캐시·기존 서비스 데이터가 없는지 확인한다.

## 게시

독립 저장소에 검토한 소스를 커밋하고 `v<version>` 태그를 push한다. 첫 시험 릴리스는 `v0.1.0`이다. PR은 빌드/정책 검사를 수행하고 태그와 수동 workflow는 서명된 release APK도 검증한다.

태그 workflow는 다음을 모두 통과해야 draft를 만들고 prerelease로 게시한다.

1. Windows: 코어 검사 → win-x64 self-contained publish → ZIP 생성 → 그 ZIP에서 꺼낸 실행 파일 시작·설정 저장·재시작 복원 검사.
2. Android: 단위 테스트/lintRelease → 동일 release 키 서명 → `apksigner verify` → 그 APK를 Android 10 에뮬레이터에 설치·실행하고 카메라 권한 미요청 확인.
3. 통과한 정확한 두 artifact를 다운로드해 `SHA256SUMS.txt`를 생성·재확인한 뒤 APK/Windows ZIP/checksum 3개를 게시한다.

개별 실행은 `gh workflow run release.yml --repo lunce0503/flownote-remote-service --ref main`으로 검증할 수 있다. main 참조의 수동 실행은 GitHub Release를 게시하지 않는다. 최초 태그 push에서 실행이 등록되지 않았다면 같은 소스 태그에 `--ref v<version>`으로 수동 실행해 검증 후 게시할 수 있다. 이미 게시한 태그/기존 파일을 덮어쓰지 않는다. 실패는 job 로그에서 원인을 확인하고 수정 버전으로 배포한다.

## 확인·복구

`gh release view v<version> --repo lunce0503/flownote-remote-service --json url,isDraft,isPrerelease,assets`로 공개 상태와 파일 3개를 확인하고, 다운로드한 파일의 SHA-256을 비교한다. 소스 태그와 workflow head SHA도 일치해야 한다. 실제 카메라·오디오·Bluetooth 검증은 아직 없는 기능을 검증한 것으로 간주하지 않는다.

문제가 있으면 해당 시험 릴리스를 draft로 돌려 신규 다운로드를 중지하고 원인을 기록한다. 이미 설치된 앱의 데이터·서명키를 삭제하거나 다른 키로 동일 패키지를 교체하지 않는다. 수정 버전은 같은 release 키와 더 높은 versionCode를 사용한다.

이 작업에는 Vercel/Railway 런타임 배포가 없다. Flownote 웹 다운로드 페이지/서버를 변경할 때만 서비스 저장소의 `node scripts/deploy-cloud.mjs release <target>`으로 staging 검증 후 production을 반영한다.
