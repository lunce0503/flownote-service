# Flownote Remote

Windows PC 또는 Linux CLI 서버가 제스처·명령·상태 알림을 관리하고 Android·Windows 클라이언트가 카메라·소리·조작 화면을 담당하는 원격 앱이다. 프로젝트 폴더는 `flownote-remote/`다.

독립 배포 저장소: [lunce0503/flownote-remote-service](https://github.com/lunce0503/flownote-remote-service).
[시험판 다운로드](https://github.com/lunce0503/flownote-remote-service/releases).

## Linux CLI와 Codex 음성

Linux x64 서버 실행·기기/초대/제스처/소리 관리와 Codex 네이티브 음성 실행 및 실험적 PCM 브리지를 추가했다. 설치, 명령, systemd, SSH 음성 연결과 실제 계정 검증 제한은 [CLI 안내](docs/CLI.md)를 따른다. 0.4.1부터 로그인된 Codex ChatGPT 계정과 WebRTC를 사용한다. API 키를 요구하거나 API 키 인증으로 대체하지 않는다. 실제 계정 세션 연결과 음성 응답 수신을 확인했다. Android/Windows 앱 마이크 연결은 아직 없다.

## 현재 가능한 것

- 소리·카메라·제스처·음성 알림 대시보드, 클라이언트 사용 토글/이름/실제 연결 기능 요약, `⋯` 세부 메뉴.
- 2분·일회용 QR 표시/카메라 읽기, 연결 코드 복사/붙여넣기, 저장된 서버 재연결. 서버 확인 후에만 등록하며 기기별 일시 중지와 서버 사용 허용을 구분한다.
- Windows HTTPS/WSS 서버, 기기별 인증·일회용 코드·인증서 지문 대조, 등록 해제.
- Android/Windows 클라이언트에서 손·자세 골격 추출/표시, 골격 데이터만 전송, 서버의 11개 범주별 제스처 판정과 실제 적용 응답.
- 후면/물리 카메라 선택, 전체 앱 최소화/복원/음소거, 실제 Codex 음성 작업 선택, 키보드/핀치 음량·확대·위치 조정. [제스처 안내](docs/GESTURES.md)를 따른다.
- 기기 상태와 배터리/메모리/출력/연결 경고의 화면 및 OS TTS 음성 알림.
- 기존 제스처 설정 저장/복원과 합성 입력 테스트. 합성 테스트는 실제 장치 명령을 실행하지 않는다.
- Windows의 [sound_manger](https://github.com/lunce0503/sound_manger) DSP 코어. EQ·음원 믹싱의 실제 입출력 경로는 아직 연결 전이다.

역할·연결 순서·보안·메시지 계약은 [네트워크 문서](docs/NETWORK.md)를 따른다. 원격 앱에 한해 사용자 요구에 따른 PC 서버와 사설/VPN 직접 연결을 사용한다. 기존 Flownote 웹/백엔드 cloud 통신 규칙은 바꾸지 않는다. 카메라와 서버 제스처 명령은 자동 시작하지 않는다. 음원 스트리밍·분리/합성, 화면 배치·프로젝터 출력, 대화형 AI 비서는 미연결이며 기능 목록에도 false로 표시한다. 알림 음성은 실제 상태 규칙과 OS TTS다.

## 개발

화면 구성과 QR 사용 순서는 [UX 명세](docs/UX.md)를 따른다.

Windows는 .NET 10 SDK와 WPF를 사용한다. Windows에서:

```powershell
node scripts/prepare-vision.mjs
dotnet run --project tests/Flownote.Remote.Checks -c Release
dotnet run --project tests/Flownote.Remote.Network.Checks -c Release
dotnet run --project tests/Flownote.Remote.Windows.Checks -c Release
dotnet build src/Flownote.Remote.Windows -c Release
dotnet run --project src/Flownote.Remote.Windows
```

설정은 `%LOCALAPPDATA%/Flownote/Remote/settings.json`에 저장한다. 잘못된 저장값은 기본값으로 표시하고 저장 전까지 기존 파일을 보존한다. .NET 코어 검사는 Linux에서도 실행할 수 있고 Windows 프로젝트는 교차 컴파일할 수 있다. WPF 실행 확인에는 Windows가 필요하다.

Windows 카메라 인식에만 WebView2 Runtime이 필요하다. 모델은 `vision.lock.json`으로 검증해 EXE에 포함하고 런타임 영상은 외부 AI 서비스에 보내지 않는다. 인터넷 권한은 서버 통신에 사용하며 마이크 녹음 권한은 없다.

Android는 JDK 17, SDK 35, Build Tools 35.0.0을 사용한다. Android Studio에서 `android/`를 열거나:

```bash
cd android
# ANDROID_HOME을 설치된 SDK 경로로 설정한다. Windows에서는 gradlew.bat 사용.
./gradlew testDebugUnitTest lintDebug assembleDebug
```

개발 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`다. debug 패키지는 `com.flownote.remote.gesture.staging`, release는 `com.flownote.remote.gesture`로 기존 Flownote 앱·원격 터미널과 구분한다. 설정은 앱 전용 SharedPreferences에 저장하고 백업/기기 이전에서 제외한다. 공개 APK는 앱 전용 release 키로 서명한다. 서명/배포 설정은 [릴리스 절차](docs/RELEASING.md)를 따른다.

## 코드 지도

| 경로 | 역할 |
| --- | --- |
| `config/default-settings.json` | 두 플랫폼이 사용하는 기본 설정 계약 v1 |
| `src/Flownote.Remote.Core/` | 설정 검증, 제스처 실행 후보 필터, Sound Manager 연결 |
| `src/Flownote.Remote.Network/` | HTTPS/WSS 등록·기기 상태·제스처/출력 명령·위험 알림 |
| `src/Flownote.Remote.Cli/` | Linux 서버/로컬 관리 소켓, Codex 네이티브 음성·PCM 브리지 |
| `src/Flownote.Remote.Windows/` | WPF 서버/클라이언트, WebView2/MediaPipe, WASAPI 음량 API·TTS |
| `android/app/` | Android 설정·클라이언트, Camera2, Keystore, AudioManager·TTS |
| `vendor/sound-manager/` | 커밋 고정한 원본 소리 코어 및 MIT 라이선스 |
| `tests/Flownote.Remote.Checks/` | .NET 실행 검사: 설정·제스처 정책·소리 코어 |
| `.github/workflows/release.yml` | 독립 저장소의 Android·Windows 빌드/실행 검사와 태그 기반 시험 릴리스 |
| `scripts/` | 버전 검사, Windows 패키징, 실제 배포 파일 실행 검사 |

공유 설정은 .NET embedded resource와 Android assets로 동일 파일을 포함한다. 양쪽 정책을 바꿀 때 테스트도 함께 확인한다. 이 README가 독립 저장소의 기능 범위를 기록하며, 배포 절차는 [릴리스 문서](docs/RELEASING.md)를 따른다. 재사용 출처는 [UPSTREAM](vendor/sound-manager/UPSTREAM.md)을 따른다.

## 다음 연결 단계

1. 실제 음원 캡처/전송·재생 버퍼를 Sound Manager DSP에 연결한다.
2. 음원 분리 모델·화면 합성/배치·프로젝터 출력 모듈을 구현한다.
3. 대화형 비서 제공자와 권한 있는 작업 도구를 연결한다. 위험 알림은 대화형 AI 응답과 독립적으로 즉시 처리한다.
4. 공개 인터넷 연결이 필요하면 별도 인증·중계·지연/비용 설계를 먼저 수행한다. 현재는 신뢰하는 사설망/VPN만 지원한다.

앱 바이너리는 독립 GitHub 저장소의 시험 릴리스로 배포한다. Windows는 항상 단일 EXE이며 .NET·인식 모델·라이선스를 포함한다. Android는 같은 키로 서명한 APK다. 연결 방법과 제한은 [릴리스 노트](release-notes/v0.5.1.md)를 따른다. Vercel/Railway 서비스는 이 PC 앱 서버와 별개이며 변경하지 않는다. 웹 다운로드 자산이나 cloud API를 바꾸는 작업은 본 서비스 저장소의 staging-first 배포를 따른다.
