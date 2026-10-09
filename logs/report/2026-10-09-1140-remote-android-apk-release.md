# Remote Android APK 사전 릴리즈 완료

## 배포 결과

- 게시 시각: 2026-10-09 11:40:04 UTC.
- 버전: 0.1.0, versionCode 1, applicationId `kr.flownote.remote`, Android 10 이상.
- 태그: `remote-android-v0.1.0`.
- 배포 소스: `9263d24f7419b114f2eef6c77422b19b5c6a1e2a`.
- [GitHub 릴리즈](https://github.com/lunce0503/flownote-service/releases/tag/remote-android-v0.1.0): 공개 사전 릴리즈, draft 아님.
- [설치 APK](https://github.com/lunce0503/flownote-service/releases/download/remote-android-v0.1.0/flownote-remote-v0.1.0.apk): 42,995,435 bytes.
- [SHA256SUMS.txt](https://github.com/lunce0503/flownote-service/releases/download/remote-android-v0.1.0/SHA256SUMS.txt).
- APK SHA-256: `2d6d176bc358f8f411b6cee21c8818c7636806ca8a465a00744c3ca379196e81`.
- 서명 인증서 SHA-256: `6ca2b19865f403970e31304c65d11c2a00d4adb89143d39f698441cb84c88126`.

## 수정 내용

기존 CI `37122413485`에서 연결 상태가 CONNECTED이고 WebView의 크기도 양수였지만 회전 후 `ROTATE_OK` 출력이 보이지 않았다. 이전 실패에서는 가로 화면과 IME가 터미널 공간을 모두 차지했다.

- IME가 열릴 때 composition 구조가 바뀌지 않도록 화면 방향/크기로 compact 모드를 결정한다.
- 가로 화면의 상태 표시를 줄이고 입력창과 가로 스크롤 도구줄을 한 줄에 둔다. 매우 낮은 WebView의 세로 padding을 줄인다.
- `AndroidView.onRelease`에서 해당 WebView만 정리한다. 이전 View가 새 renderer를 해제하지 않도록 인스턴스 소유권을 확인한다.
- 네이티브 명령/제어키 전송이 성공하면 xterm을 최신 출력 위치로 이동한다. 출력 수신만으로 사용자의 스크롤 위치를 강제 변경하지 않는다.
- 축소된 viewport 보존, Host resize 제한, native follow 명령의 부수 효과를 브리지 회귀 테스트로 확인한다.

관련 소유 문서: [제품 동작](../../docs/product-specs/remote-android.md), [수용 시험](../../apps/android/ACCEPTANCE.md), [설치 안내](../../apps/android/README.md). 버그 기록은 [회전·화면 복구](../bugs/2026-10-03-remote-android-build-and-screen-recovery.md)에 남겼다.

## 검증

| 검증 | 결과 / 근거 |
| --- | --- |
| 로컬 `npm test --prefix apps/android/terminal` | 7개 통과 |
| `git diff --check` | 통과 |
| [main 소스 CI 37923870084](https://github.com/lunce0503/flownote-service/actions/runs/37923870084) | build/unit/lint/Android 수용 시험 통과 |
| [릴리즈 태그 CI 37924345369](https://github.com/lunce0503/flownote-service/actions/runs/37924345369) | verify 및 release 모두 성공, 같은 소스 |
| JVM 단위 테스트 | 8개, 실패/무시 0 |
| 실제 Android/Linux Host WSS·PTY 통합 시험 | 1개 전체 흐름, 실패/skip 0; 잘못된 지문/토큰, 암호화 저장, ANSI/한글, 도구키, 붙여넣기 취소, 10회 단절, 백그라운드 복귀, 회전, WebView 손실 후 새 세션, 종료 |
| Android lint | 오류 0, 경고 23; 최신 SDK/의존성, WebView feature 검사와 사용자 정의 지문 검증 등 기존 경고를 남김 |
| UI 캡처 | CI의 세로 터미널/가로 터미널/빈 등록 화면을 직접 확인. 가로 IME 상태에서 ROTATE_OK와 프롬프트가 표시되고 입력창·도구줄·터미널이 겹치지 않음 |
| 서명 | CI `apksigner verify --verbose --print-certs`: APK Signature Scheme v2 통과, RSA 4096 |
| 배포 APK 새 설치 | API 35 에뮬레이터 설치·실행, 등록 화면 및 실행 프로세스 확인 성공 |
| 테스트 인증정보 | CI의 APK 검사와 다운로드한 APK의 `jar tf` 목록에 `assets/host.json` 없음. xterm/fit 번들 존재 |
| 게시 산출물 | GitHub에서 APK와 체크섬을 직접 다운로드, `sha256sum --check SHA256SUMS.txt` 결과 OK |

로컬 APK 목록 확인에서 `unzip`이 설치되지 않아 해당 명령은 실패했다. 대체한 JDK `jar tf`가 성공했으며, CI에서는 `unzip` 검사도 통과했다. 실패한 검증을 통과한 것으로 처리하지 않았다.

## 배포 경계와 남은 확인

Android APK는 GitHub Actions에서 검증 후 같은 태그 소스로 서명·게시한다. 별도 Railway 서비스나 Vercel 실행 산출물 변경이 없어 해당 클라우드 서비스는 재배포하지 않았다. 앱은 기존 Remote Host 0.2.0에 직접 WSS로 연결하며, Flownote 웹/Expo의 클라우드 API 목적지 설정을 변경하지 않는다. 이번 APK 릴리즈 과정에서 로컬 Flownote 앱 서버를 실행하지 않았다.

실기기 설치는 사용자가 직접 확인하기로 했다. 실제 휴대폰의 한글 IME 조합, Android-to-Windows 사용, 인증된 PC Codex 대화형 동작, 30분 LAN 안정성 및 Host 자식 프로세스 정리 등 전체 수용 기준은 아직 실기기 증거가 없다. 따라서 정식 안정 릴리즈/MVP 전체 수용 완료로 표시하지 않는다. 항목별 확인 절차는 `apps/android/ACCEPTANCE.md`를 따른다. 사용자는 Android 10 이상에서 APK를 설치하고 같은 LAN 또는 기존 VPN의 PC 주소·토큰·인증서 지문을 등록해 시험할 수 있다.

보고서 추가는 실행 산출물을 바꾸지 않으므로 별도 Docker 빌드·클라우드 재배포 없이 문서 존재/내용과 git diff를 검증한다. 사용자 작업의 다른 변경은 커밋·롤백하지 않는다.
