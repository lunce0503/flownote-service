# Android·Windows 제스처 원격 앱 초기 설정

## 범위

사용자 요청: Flownote 원격 앱 작업 공간을 준비하고, 사용자 GitHub 소리 관리 기능 재사용 기반과 Android·Windows 및 제스처 설정을 구성한다. 비어 있던 폴더에 초기 앱을 추가했으며, 후속 사용자 요청에 따라 현재 경로는 `flownote-remote/`로 정정했다. 기존 상위 저장소 변경은 보존했다.

실제 원본 저장소는 `lunce0503/sound_manager`가 아닌 [`lunce0503/sound_manger`](https://github.com/lunce0503/sound_manger)다. 연결된 GitHub 도구와 인증된 CLI로 확인했다. 고정 커밋 `792cdac30b436d9bbc92933d341316ad03cf0ded`의 .NET 10 소리 코어(Contracts/Mixer/AudioSource/Biquad/프로젝트 파일)만 재사용하고 MIT 원문을 보존했다. 4개 C# 파일과 LICENSE의 Git blob hash가 원본과 일치함을 확인했다. 원본 LAN/loopback HTTP 서버·Quick Tunnel·QR 연결키·캡처 서비스는 포함하지 않았다.

## 변경

- .NET 10 WPF Windows 앱과 Java 17/SDK 35/minSdk 29 Android 앱의 독립 설정 화면.
- `config/default-settings.json`을 .NET resource/Android assets에 공통 포함. 설정 v1 검증·저장·복원·기본값 복원. Android 회전 시 편집값 보존.
- 제스처 매핑, 카메라 방향, 신뢰도/유지 시간/재실행 간격, 음량/EQ 설정. 기본 제스처 OFF, 비서 비활성·실행 전 확인 고정.
- 두 플랫폼 GestureGate: 신뢰도, 연속 유지, 동작 후 해제 요구, 재실행 간격, 프레임 손실/시각 역행 방어. 합성 테스트는 실행 후보 이름만 표시.
- Windows SoundController가 재사용 믹서/EQ 설정을 적용한다. PCM 입력/출력 장치와 시스템 음량은 아직 연결하지 않았다. Android도 설정 저장만 수행한다.
- CAMERA 선언만 준비하고 권한 요청·프레임 수집은 없다. Android 인터넷/마이크 권한 없음, cleartext 금지, 백업/기기 이전 제외.
- 신규 GitHub Actions `gesture-remote-apps.yml`: Windows 빌드/코어 검사와 Android 단위/lint/APK 빌드. 게시·자동 배포 없음. workflow는 추가했으며 push/원격 실행은 하지 않았다.
- README, 제품 사양과 색인, ARCHITECTURE 코드맵, API 호환성 버그 기록 갱신.

## 검증

1. Android 디렉터리에서 `ANDROID_HOME=/tmp/flownote-app-android-sdk ./gradlew testDebugUnitTest lintDebug assembleDebug`: 최종 성공, 단위 테스트 5건 실패/오류 0, lint 이슈 0, debug APK 생성. 첫 실패의 NewApi 4건과 후속 테스트 컴파일 오류는 [버그 기록](../bugs/2026-10-23-gesture-remote-android-api-compatibility.md)에 원인·수정을 남겼다.
2. 공식 .NET 10 SDK Docker 이미지의 빌드 전용 컨테이너에서 `dotnet run --project tests/Flownote.Remote.Checks -c Release`: 성공. 기본값/JSON 복원, 비활성/신뢰도/유지/해제/cooldown/프레임 손실 정책과 재사용 믹서/EQ 연결 검증.
3. 같은 SDK 환경에서 `dotnet build src/Flownote.Remote.Windows -c Release`: 성공, 경고 0/오류 0. Linux 교차 빌드이며 WPF 실행 확인은 하지 않았다.
4. Gradle 8.14.3 배포 checksum은 공식 endpoint와 대조했다. wrapper jar와 실행 스크립트는 기존 Flownote Android 자산을 재사용했다.
5. `git diff --check` 통과. APK manifest의 카메라 권한/기존 앱과 다른 staging package, 원본 라이선스/파일 일치 확인.

로컬 앱 서버·Compose·DB는 실행하지 않았다. Windows WPF 실행, Android 실기기 UI/카메라, Bluetooth/오디오, cloud E2E는 검증하지 않았다. 실제 카메라 인식·장치 명령·비서 제공자는 구현 전이므로 그 동작을 완료했다고 간주하지 않는다.

## 배포와 다음 조치

이번 변경은 초기 네이티브 앱 소스와 검사/문서다. 웹·Railway 런타임·다운로드 페이지/배포 바이너리는 변경하지 않았다. `scripts/deploy-cloud.mjs`의 target 목록에 이 앱은 없으므로 staging/production 배포를 실행하지 않았다. Android는 개발용 debug APK만 생성했고 운영 서명키·EXE/APK 배포·공개 release는 구성하지 않았다.

다음 작업은 온디바이스 카메라/인식 모델 선택·권한 및 생명주기 구현, 실제 소리/비서 어댑터, 인증된 cloud 제어 계약 확정, 실기기 검증이다. 서명 바이너리와 다운로드 자산을 준비하면 저장소 루트에서 `node scripts/deploy-cloud.mjs release web`으로 staging E2E를 통과한 같은 소스를 production에 배포한다. 그 전에는 무관한 기존 웹/백엔드를 재배포하지 않는다.
