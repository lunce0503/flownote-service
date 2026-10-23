# Flownote Remote GitHub 초기 시험 릴리스

## 결과

- 사용자 지정 저장소: https://github.com/lunce0503/flownote-remote-service
- 공개 릴리스: https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.1.0
- release ID: `421589503`, `draft=false`, `prerelease=true`.
- 게시 시각: 2026-10-23 17:08:18 Asia/Seoul.
- 릴리스 소스 태그: `v0.1.0`, 커밋 `3213afcc7c75dd7f4e1d2beb8295631232d96770`.
- Actions: https://github.com/lunce0503/flownote-remote-service/actions/runs/39922096570 — Android, Windows, release job 전부 SUCCESS.

카메라 제스처 원격 앱의 초기 설정 시험판이다. 제스처별 동작·신뢰도·유지 시간·재실행 간격과 카메라 방향·음량/EQ를 저장/복원하고 합성 입력 후보를 표시한다. 실제 카메라 프리뷰/인식, 시스템 음량·실제 오디오 출력, 비서 실행, 기기 연결은 아직 제공하지 않으며 README·앱 화면·릴리스 노트에 이를 명시했다.

## 소스와 자동화

비어 있던 대상 저장소에 `flownote-remote/`의 소스만 루트 구조로 게시했다. 격리된 임시 Git checkout에서 main과 최초 태그를 push해 상위 서비스 저장소의 origin·커밋·기존 변경을 건드리지 않았다. 빌드 캐시·기존 서비스·업로드 자산·비밀값·서명키는 포함하지 않았다. 최초 source 49개 파일의 공개 대상·비밀값 패턴을 확인했다.

추가 구성은 독립 `.github/workflows/release.yml`, 버전 일치 검사, Windows self-contained portable 패키징과 GUI 저장/복원 검사, Android 서명/에뮬레이터 검사, 서드파티 라이선스와 독립 README/릴리스 절차다. Windows ZIP은 .NET 런타임과 Sound Manager/.NET MIT 고지를 포함한다. Windows Authenticode·설치 프로그램·자동 업데이트는 없다.

최초 태그 push 후 실행 목록이 비어 있어 같은 태그의 `workflow_dispatch`로 실행했다. 태그를 이동하거나 force-push하지 않았다. 검증된 파일만 draft에 올린 뒤 공개 prerelease로 전환했다. 이후 main의 `bb60e21`은 수동 태그 실행 설명과 PowerShell 검사 변수 이름만 정정한 후속 커밋이며 공개 바이너리의 태그/소스는 위 `3213afc`로 고정했다.

## Android 서명

- 패키지: `com.flownote.remote.gesture`, versionName `0.1.0`, versionCode `1`, minSdk 29/targetSdk 35.
- 별도 release alias `flownote-remote`, RSA 3072, APK Signature Scheme v2 검증 성공. debug 가능 플래그 없음.
- 인증서 SHA-256: `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`.
- 보존 경로: `/home/kwon/.local/share/flownote-gesture-remote-release/`의 전용 PKCS12와 password 파일. 저장소 밖에서 제한된 권한으로 생성·보관한다. 실제 비밀번호·키 내용은 기록하지 않는다.
- GitHub Actions secrets는 `FLOWNOTE_REMOTE_KEYSTORE_BASE64`, `FLOWNOTE_REMOTE_SIGNING_PASSWORD`를 등록했다. 소스에는 이름과 환경 변수 계약만 있다. 향후 설치 유지 업데이트에도 같은 키와 증가한 versionCode를 사용한다.

## 게시 파일과 검증

| 파일 | 크기 (bytes) | SHA-256 |
| --- | --- | --- |
| `Flownote-Remote-0.1.0-android.apk` | 25746 | `15817d62c2186547b4dd462f4d1f2a4710b482b497d9cbea1083e4a59afaa2a4` |
| `Flownote-Remote-0.1.0-windows-x64.zip` | 60794889 | `bd3df4bfc4966f8100ba1d80433c53f596915ff607cf7078167f04c460698888` |
| `SHA256SUMS.txt` | 204 | `84fb06d1b0f1c4d4871005cdda91bceedb87a157d9420ba0a1797314ff87c2a7` |

1. 격리된 소스에서 `node scripts/check-release.mjs`, `bash -n scripts/smoke-android.sh`, Android의 `./gradlew testDebugUnitTest lintRelease assembleRelease`, .NET 코어 실행 검사를 통과했다. 독립 문서 링크와 workflow의 두 플랫폼 release gate도 검사했다.
2. GitHub Windows runner: 코어 검사 → win-x64 self-contained publish → ZIP 생성 → 그 ZIP에서 꺼낸 EXE 실제 시작·설정 저장·종료/재시작 복원까지 PASS. Windows job `120309520511`.
3. GitHub Android runner: 단위 테스트/lintRelease/release 빌드 → release 키 서명 검증 → 그 APK를 Android 10/API 29 에뮬레이터에 설치·실행 → 카메라 권한 미요청 확인 PASS. Android job `120309520432`.
4. release job `120310854745`는 통과한 두 artifact를 그대로 받아 SHA-256을 생성·검사한 뒤 파일 3개를 게시했다. 게시 직전 다시 빌드하지 않았다.
5. 공개 릴리스에서 APK/ZIP/checksum을 재다운로드해 `sha256sum -c SHA256SUMS.txt` 두 파일 OK. GitHub asset digest도 일치한다. 인증 없이 공개 checksum URL을 읽는 데 성공했다.
6. 다운로드 APK를 `apksigner verify --print-certs`로 재검증하고 보관된 release 키의 공개 인증서 digest와 일치함을 확인했다. manifest의 정식 패키지/버전·비debug·CAMERA 외 인터넷/마이크 권한 없음도 확인했다.
7. Windows ZIP의 EXE·README·릴리스 노트·Sound Manager/.NET 라이선스 포함 확인. `git diff --check` 통과.

관찰 도구 `gh run watch`는 중간에 GitHub HTTP 502로 종료됐지만 실제 빌드는 계속 진행됐다. 같은 run ID를 재조회해 SUCCESS를 확인했으며 중복 빌드를 시작하지 않았다. 로컬 ZIP 확인에서 `unzip` 미설치로 명령이 실패해 JDK `jar tf`로 대체 검증했다. 해결된 관찰/도구 문제이며 최종 검증 실패는 없다.

## 배포 범위와 후속

이번 요청의 배포 대상은 GitHub 네이티브 앱 릴리스다. Vercel 다운로드 페이지·Railway/웹 런타임은 변경하지 않아 cloud staging/production 배포는 실행하지 않았다. 그 결과물을 바꾸는 후속 작업에서는 서비스 저장소의 `node scripts/deploy-cloud.mjs release web` 또는 영향받는 target의 staging-first 배포를 사용한다.

Android 10 에뮬레이터 및 Windows runner 실행 검증과 실제 카메라/오디오 하드웨어 검증은 구별한다. 카메라·소리 출력·비서·기기 간 cloud E2E는 후속 구현 범위다. 설치는 Android APK 또는 Windows ZIP 전체 압축 해제 후 `Flownote.Remote.exe` 실행이다.

문제가 있는 시험판은 `gh release edit v0.1.0 --repo lunce0503/flownote-remote-service --draft=true`로 신규 공개 다운로드를 중지할 수 있다. 기존 파일·기기 설정·서명키는 삭제하지 않으며 수정 버전은 같은 키로 더 높은 버전/Android versionCode를 사용한다.
