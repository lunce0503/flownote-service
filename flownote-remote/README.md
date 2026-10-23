# Flownote Remote

카메라 제스처로 소리와 비서 기능을 제어하기 위한 **Android·Windows 전용 앱의 초기 설정**이다. 프로젝트 폴더는 `flownote-remote/`다.

독립 배포 저장소: [lunce0503/flownote-remote-service](https://github.com/lunce0503/flownote-remote-service).
[v0.1.0 시험판 다운로드](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.1.0).

## 현재 가능한 것

- 두 앱의 네이티브 설정 화면, 기기별 설정 저장·복원, 기본값 복원.
- 제스처별 동작 선택, 신뢰도·유지 시간·재실행 간격, 카메라 방향, 음량·EQ 설정.
- 합성 제스처 입력으로 실행 후보 이름 확인. 실제 장치 명령은 실행하지 않는다.
- Windows에서 [sound_manger](https://github.com/lunce0503/sound_manger)의 MIT 소리 코어 참조와 EQ 설정 적용.

카메라 프리뷰·실제 인식 모델, PCM 캡처/재생, 시스템 음량 제어, 기기 간 연결, 비서 제공자는 아직 연결하지 않았다. 앱 화면에도 준비 상태를 표시한다. 제스처 사용은 기본 OFF이고 비서는 비활성 상태다. 카메라 권한은 Android manifest에만 준비했으며 앱에서 요청하거나 사용하지 않는다. 마이크 권한과 네트워크 권한은 없다.

## 개발

Windows는 .NET 10 SDK와 WPF를 사용한다. Windows에서:

```powershell
dotnet run --project tests/Flownote.Remote.Checks -c Release
dotnet build src/Flownote.Remote.Windows -c Release
dotnet run --project src/Flownote.Remote.Windows
```

설정은 `%LOCALAPPDATA%/Flownote/Remote/settings.json`에 저장한다. 잘못된 저장값은 기본값으로 표시하고 저장 전까지 기존 파일을 보존한다. .NET 코어 검사는 Linux에서도 실행할 수 있고 Windows 프로젝트는 교차 컴파일할 수 있다. WPF 실행 확인에는 Windows가 필요하다.

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
| `src/Flownote.Remote.Windows/` | WPF 설정 화면·저장·테스트 입력 |
| `android/app/` | Android Java 설정 화면·저장·제스처 필터 |
| `vendor/sound-manager/` | 커밋 고정한 원본 소리 코어 및 MIT 라이선스 |
| `tests/Flownote.Remote.Checks/` | .NET 실행 검사: 설정·제스처 정책·소리 코어 |
| `.github/workflows/release.yml` | 독립 저장소의 Android·Windows 빌드/실행 검사와 태그 기반 시험 릴리스 |
| `scripts/` | 버전 검사, Windows 패키징, 실제 배포 파일 실행 검사 |

공유 설정은 .NET embedded resource와 Android assets로 동일 파일을 포함한다. 양쪽 정책을 바꿀 때 테스트도 함께 확인한다. 이 README가 독립 저장소의 기능 범위를 기록하며, 배포 절차는 [릴리스 문서](docs/RELEASING.md)를 따른다. 재사용 출처는 [UPSTREAM](vendor/sound-manager/UPSTREAM.md)을 따른다.

## 다음 연결 단계

1. 온디바이스 손 제스처 모델·라이선스·카메라 프레임 입력을 결정하고 각 OS의 프리뷰/권한/백그라운드 중지를 구현한다. 현재 제스처 ID는 예약된 설정값이며 모델 설치를 의미하지 않는다.
2. 실제 인식 결과를 `GestureGate`에 단조 증가 밀리초로 공급한다. 손 없음/신뢰도 미달 프레임도 공급하고 세션 종료·설정 변경 시 `Reset/reset`한다.
3. 소리 장치 제어와 비서 제공자를 연결한다. 테스트 입력은 실제 실행과 분리해서 유지한다. 비서 실행에는 사용자 확인이 필요하다.
4. 기기 간 제어는 Flownote cloud 인증·권한 계약을 먼저 정한다. LAN/loopback 서버·임시 터널은 추가하지 않는다.

앱 바이너리는 독립 GitHub 저장소의 시험 릴리스로 배포한다. Windows ZIP은 .NET 런타임을 포함하며 압축을 모두 푼 뒤 `Flownote.Remote.exe`를 실행한다. Android는 서명된 APK를 설치한다. 기능 제한과 설치 방법은 [릴리스 노트](release-notes/v0.1.0.md)에 있다. 이 앱에는 cloud 실행 산출물이 없고 Vercel/Railway 서비스도 변경하지 않는다. Flownote 웹 다운로드 페이지나 cloud API를 바꾸는 후속 작업에서는 본 서비스 저장소의 staging-first 배포 절차를 적용한다.
