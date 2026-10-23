# 카메라 제스처 원격 앱

## 목표와 현재 범위

소유 코드: [`flownote-remote/`](../../flownote-remote/README.md). Android와 Windows에서 카메라 제스처를 판단해 소리 관리·비서 기능을 제어하는 앱을 준비한다. 기존 웹 설치 앱(`flownote-android`, `flownote-desktop`)과 원격 터미널(`apps/android`, `apps/host`)과는 별도의 앱이다. iOS·macOS·Linux 앱은 현재 대상이 아니다.

0.1.0 초기 설정은 네이티브 화면, 로컬 설정 저장/복원, 제스처 매핑과 합성 입력 검사까지 제공한다. 카메라 프리뷰/인식·시스템 음량·오디오 스트리밍·비서 실행·기기 연결은 아직 제공하지 않는다. 화면과 테스트 결과는 준비 상태를 명시한다.

## 사용자 흐름

1. 앱을 열면 설정을 복원한다. 저장값이 잘못됐으면 기본값을 표시하고 저장 전까지 기존 설정은 보존한다.
2. 카메라 방향과 제스처 사용 여부, 신뢰도·유지 시간·재실행 간격, 제스처별 동작을 고른다.
3. 음량·EQ 프리셋을 설정하고 저장한다. Windows는 내부 Sound Manager 믹서 설정에 반영한다. 실제 출력은 연결 전이다. Android는 설정만 보관한다.
4. 테스트할 제스처를 선택하면 유지 시간에 맞는 합성 입력으로 실행 후보만 표시한다. 기본 OFF에서는 후보가 없다. 설정을 저장하지 않고도 테스트할 수 있다.
5. 기본값 복원은 편집 화면에만 반영하며 저장 버튼을 눌러야 영구 적용한다. Android 회전/Activity 재생성에서는 편집 중인 값을 Bundle에 보존한다.

## 설정과 실행 후보 정책

공통 기본값의 소유자는 [`config/default-settings.json`](../../flownote-remote/config/default-settings.json)이다. .NET/Android가 같은 파일을 번들에 포함한다. v1만 허용하며 알려진 제스처와 동작만 설정할 수 있다. 네트워크 인증값은 저장하지 않는다.

| 설정 | 기본값 | 허용 범위 |
| --- | --- | --- |
| 제스처 사용 | OFF | ON/OFF (현재 테스트 후보에만 적용) |
| 카메라 방향 | front | front/back, 실제 카메라 선택은 후속 |
| 최소 신뢰도 | 0.8 | 0.5–1.0 |
| 유지 시간 | 400 ms | 100–2000 ms |
| 재실행 간격 | 1200 ms | 300–5000 ms |
| 음량 | 0.7 | 0–1 |
| 음량 변화량 | 0.05 | 0.01–0.2, 현재 화면 편집·실행 미연결 |
| EQ | flat | flat/bass/treble/soft/clear |
| 비서 | 비활성·실행 전 확인 | 실제 제공자 연결 전 활성화 불가 |

| 예약 제스처 | 기본 실행 후보 |
| --- | --- |
| Thumb_Up / Thumb_Down | volume_up / volume_down |
| Closed_Fist | mute |
| Victory | assistant_open (실행 미연결) |
| Open_Palm / Pointing_Up / ILoveYou | none |

알려진 모델의 범용 손 모양 ID를 설정 슬롯으로 예약했으며 인식 모델을 설치한 상태는 아니다. 실제 후보 필터는 연속 관찰·최소 신뢰도·유지 시간을 모두 만족해야 한다. 같은 제스처를 유지하면 한 번만 반환하며 해제/손실 뒤 재진입해야 한다. 후보 간 간격을 제한하고, 관찰 간격이 250 ms를 넘으면 유지 시간을 다시 센다. 신뢰도 미달·NaN/무한대·알 수 없는 제스처는 실행하지 않는다. timestamp는 단조 증가 밀리초를 사용하며 역행 시 상태를 초기화하고 해당 입력은 버린다. 카메라 세션/설정 변경 시 필터도 초기화해야 한다.

## 아키텍처와 보안 경계

- Windows: .NET 10 WPF → `Flownote.Remote.Core` → MIT `SoundManager.Core`. 원본 [sound_manger](https://github.com/lunce0503/sound_manger)의 고정 커밋 `792cdac30b436d9bbc92933d341316ad03cf0ded`에서 DSP 코어 4개 파일과 프로젝트만 재사용한다. 출처·라이선스는 `vendor/sound-manager/`에 보존한다.
- Android: SDK 35, minSdk 29, Java 17, 플랫폼 UI. `com.flownote.remote.gesture[.staging]`로 기존 앱과 구분한다. 앱 전용 SharedPreferences를 사용하고 백업/기기 이전을 제외한다.
- 원본의 LAN/loopback 서버, Quick Tunnel, QR 연결키, 캡처 서비스는 가져오지 않는다. HTTP·WS·소켓 리스너와 cloud API 호출은 없다.
- Android는 CAMERA 권한 선언만 준비했고 요청·프레임 수집은 없다. 마이크/인터넷 권한은 없다. Windows도 아직 카메라 API를 호출하지 않는다. 후속 카메라는 기기 안에서 처리하고 영상 저장·업로드 없이 명시적 시작/중지와 백그라운드 중지를 구현해야 한다.
- 비서는 기본 비활성이고 확인 요구를 끌 수 없다. 합성 테스트는 소리·비서 명령 실행과 연결하지 않는다.

## 빈 상태와 오류

카메라·비서·장치가 미연결임을 항상 표시한다. 저장 실패는 실패로 표시하며 성공 문구를 내지 않는다. 설정 파일/JSON이 유효하지 않으면 기본값 표시와 저장 전 원본 보존을 알린다. Windows는 임시 파일을 쓴 뒤 교체하고 Android는 저장 결과를 확인한다. 기본 번들이 누락된 경우 재설치를 안내한다.

## 검증과 배포

- `cd flownote-remote && dotnet run --project tests/Flownote.Remote.Checks -c Release`
- `cd flownote-remote && dotnet build src/Flownote.Remote.Windows -c Release`
- `cd flownote-remote/android && ./gradlew testDebugUnitTest lintDebug assembleDebug`
- 본 서비스의 `.github/workflows/gesture-remote-apps.yml`은 Windows/Android 빌드·정책 검사만 수행한다. 독립 배포 저장소 `lunce0503/flownote-remote-service`에서는 [`flownote-remote/.github/workflows/release.yml`](../../flownote-remote/.github/workflows/release.yml)이 서명 APK와 Windows portable ZIP을 검사한 뒤 태그 기반 시험 릴리스를 게시한다. 절차는 [릴리스 문서](../../flownote-remote/docs/RELEASING.md)를 따른다.

시험 릴리스는 Windows runner에서 실제 WPF 실행·설정 저장/재시작 복원, Android 10 에뮬레이터에서 서명 APK 설치/실행을 검증한다. 카메라 실기기·오디오 출력·기기 간 cloud E2E는 후속 기능 연결 뒤 검증한다. 앱 전용 release 키는 저장소 밖에 보관하며 GitHub Actions secrets로만 빌드에 제공한다. 현재 cloud 실행 산출물과 배포 target이 없어 Vercel/Railway staging/production 배포는 적용하지 않는다. 웹 다운로드 페이지/자산을 변경할 때 `node scripts/deploy-cloud.mjs release web`으로 staging 검증 후 같은 소스를 production에 반영한다.
