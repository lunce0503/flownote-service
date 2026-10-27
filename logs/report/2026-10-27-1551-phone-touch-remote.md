# 휴대폰 터치 리모컨 0.6.0

## 요청과 범위

제스처 동작을 중지하고 휴대폰의 입력창에 십자·그리드 드래그 영역과 아이콘·짧은 텍스트의 커스텀 버튼 영역을 구현한다. 영향 범위는 `flownote-remote/`의 Android UI, 인증된 서버 제어 계약, Windows 출력, Linux CLI 정책이다. 클라우드 웹/API와 다른 앱은 변경하지 않는다.

소유 명세는 [TOUCH.md](../../flownote-remote/docs/TOUCH.md), [NETWORK.md](../../flownote-remote/docs/NETWORK.md), [제품 명세](../../docs/product-specs/gesture-remote-app.md)다. 기존 QR/등록/핀 고정 TLS/WSS/기기 토큰과 서버 사용 허용을 재사용한다.

## 구현

- Android ‘터치 리모컨 열기’ → 입력창. 대상 선택, 상대 마우스 이동·탭 클릭·누른 채 드래그, 십자 그리드와 위치 표식.
- 버튼 리스트: 고정 아이콘+이름, ⋯ 이름/허용 명령 편집·삭제, 최대 8개 추가·기기 저장/복원. 클릭/우클릭/스크롤/음량/음소거·해제/앱 작업 패널 확대·초기화.
- 서버 제스처는 저장된 ON 설정·Configure에도 항상 OFF이고 CLI ON은 거부한다. 골격 검사/복구는 호환 진단용으로 유지하되 명령을 실행하지 않는다.
- Windows SendInput으로 데스크톱 마우스 출력. 체크로 해제할 수 있고 클라이언트 목록에 마우스 기능을 요약한다. Linux는 서버 중계, Android 출력은 소리와 기존 앱 패널 범위다.
- 소스/대상 pause·창 닫기·취소·연결 종료·유휴 시 드래그 해제. 소켓 객체별 드래그 소유권, 400ms hold, Windows 독립 1.5초 감시, 속도/이동량/대기량 제한. 이동마다 상태 방송·로그를 생성하지 않는다.

## 로컬 검증

- `dotnet run --project tests/Flownote.Remote.Checks -c Release`: 기존 설정·독립 골격 엔진 검사 통과. 엔진 단위 검사와 운영 서버의 제스처 차단을 구분한다.
- `dotnet run --project tests/Flownote.Remote.Network.Checks -c Release`: pinned TLS 등록/인증/재사용·제스처 차단·수동 음량/배치·불량 골격 연결 복구·터치 이동/클릭/드래그·소유자 경쟁·pause/종료/유휴 해제 통과.
- `dotnet build tests/Flownote.Remote.Windows.Checks -c Release`: Linux에서 Windows 프로젝트 교차 빌드 0 warning/error. 실제 SendInput 실행은 Windows CI로 구분한다.
- `dotnet build src/Flownote.Remote.Cli -c Release`, `dotnet run --project tests/Flownote.Remote.Cli.Checks -c Release`: 서버 소켓 권한·TLS·명령/중지·재접속·종료 통과.
- `PATH=/tmp/flownote-dotnet:$PATH LD_LIBRARY_PATH=/tmp/flownote-chromium-libs/usr/lib/x86_64-linux-gnu node tests/skeleton-camera-checks.mjs`: 실제 고정 모델·부분 상체의 범위 밖 발 관절 프레임 제외·동일 TLS 연결/수동 제어 유지 통과.
- Android `./gradlew testDebugUnitTest lintRelease assembleDebug assembleDebugAndroidTest`: 통과. 버튼 명령/이름 검증 단위 검사 포함. Android 장치의 실제 입력창/저장/터치 경로는 플랫폼 CI로 구분한다.

첫 개발 빌드의 C# params 대상 타입/Java final 필드 초기화 오류는 명시적 MouseInput 타입과 메서드 참조로 수정하고 재빌드했다. 기존 검사의 제스처 실행 기대는 새 요구에 따라 실제 서버 차단 기대와 수동 명령으로 변경했다. 대상 pause에서 해제 명령이 차단된 오류는 [재현 기록](../bugs/2026-10-27-touch-drag-release.md)과 회귀 검사로 수정했다.

## 플랫폼 검증 결과

- 최종 독립 소스: `32ec70677ae99e69ef52ff43b9610f7c43ee2f6f`.
- 같은 153개 앱 파일의 서비스 저장소 소스: `3eca4685bac2cb3543858391f07c98e345a99532`. 작업 트리·독립 저장소·서비스 저장소 파일을 바이트 단위로 대조했다.
- [공통 Quality Gates 40541581721](https://github.com/lunce0503/flownote-service/actions/runs/40541581721): web/mobile/cloud-config/Go 2개/FastAPI 2개/Spring의 8개 작업 전부 성공.
- [서비스 저장소 네이티브 CI 40541581761](https://github.com/lunce0503/flownote-service/actions/runs/40541581761): Windows/Android/Linux 전부 성공.
- [독립 Windows·Linux 40539629032](https://github.com/lunce0503/flownote-remote-service/actions/runs/40539629032): 두 플랫폼 성공. 실제 Windows SendInput 클릭/우클릭/휠/커서 이동/드래그와 독립 유휴 해제, 패키징된 단일 EXE 실행, Linux CLI/TLS/골격/음성 fixture·추출 아카이브 검사 통과. 이 실행의 Android 상태 문구 검색 검사는 스크롤 방향으로 실패해 해당 실행 전체는 failure다.
- [최종 Android 전용 40541212910](https://github.com/lunce0503/flownote-remote-service/actions/runs/40541212910): 성공. Windows/Linux는 이 선택 실행에서 skipped이며 통과로 계산하지 않는다. 직전 Windows/Linux 검증 소스 `0fe4b89368cfc0b73fe734bb67e904a097eff90d`와 최종 소스의 차이는 테스트·workflow·릴리스 문서 3개뿐이고 앱 런타임 코드는 같다. 공개 태그 검증은 항상 세 플랫폼 모두를 실행한다.

Android 10 에뮬레이터에서 정확한 서명 APK 설치·카메라 자동 권한 미요청, 기본 입력창의 탭/이동/누른 채 드래그/hold/up이 실제 TLS 출력에 도달함을 확인했다. 새 커스텀 버튼을 UI에서 추가·저장·실행하고 패드 탭과 버튼 클릭이 각각 수신되었는지 검사한다. 새 입력창 인스턴스에서 저장 복원을 확인한다. `TouchPadDeviceTest`는 이동량 범위, 탭/이동 구분, 취소 후 전송 중단, hold, 비활성 입력 차단을 확인한다.

초기 Android 검사에서 드래그 스위치의 접근성 이름 누락을 수정했다. 이후 일시 중지 검사는 서버 state의 enabled=false를 먼저 확인하고, 행 높이가 줄어 문구가 화면 위로 이동하는 실제 캡처를 근거로 양방향 스크롤 검색을 사용했다. 기존 상태·문구 검증을 제거하지 않았다. 네이티브 모델 구조상 사용하지 않는 Android CI의 서버용 Chromium 설치를 제거했고 실제 Camera2/Tasks Vision 검사는 유지했다.

## 요구사항 완료 감사

| 요구사항 | 현재 증거 |
| --- | --- |
| 제스처 작동 중지 | 서버 생성/설정 변경에서 OFF 강제, CLI ON 거부, 실제 TLS 관절 입력으로 명령이 실행되지 않는 검사 |
| 휴대폰에서 기능 실행 시 입력창 | Android 실제 대시보드 ‘터치 리모컨 열기’ UI 자동 조작 |
| 드래그 영역/버튼 영역으로 구분 | 실제 입력창의 두 영역 표제와 최종 에뮬레이터 캡처 |
| 마우스 커서 이동·터치·드래그 | Android UI→TLS→출력 수신 및 Windows 실제 SendInput 이벤트, 드래그 경쟁·종료/일시 중지 해제 |
| 십자·그리드 기반 디자인 | Canvas 십자축/28dp 그리드/위치 표식, 320dp·font scale 1.3 실제 캡처 육안 확인 |
| 아이콘·간단한 텍스트의 커스텀 버튼 리스트 | 기본/추가 버튼 목록 캡처, UI 편집·저장·실행·복원 검사, 허용 명령/이름 검증 |

Windows 좁은/넓은 화면과 Android 드래그/버튼 영역을 직접 확인했다. 좁은 화면의 긴 대상명은 선택 목록에서 축약되지만 상태 문구에서 전체 이름이 줄바꿈된다. 두 영역은 세로 스크롤로 접근하며 버튼/⋯/그리드에 겹침을 확인하지 못했다. 물리 휴대폰·물리 Windows PC·원거리 VPN의 조합은 이 에뮬레이터/러너 검증과 구별한다.

## 검증 빌드 파일

개발 검증 산출물은 `/tmp/flownote-touch-060/build/`에 내려받았다. 아직 공개 Release로 게시하지 않았다.

| 파일 | SHA-256 |
| --- | --- |
| `Flownote-Remote-0.6.0-android.apk` | `d6499b95422c2b7da8aec17555f2d501a5c18126de2762f1cc547af82829d3c4` |
| `Flownote-Remote-0.6.0-windows-x64.exe` | `44809fe0101adbf486fa4e3f9c963bb6e14fcac9e84f613149061403fb2fa385` |
| `Flownote-Remote-0.6.0-linux-x64.tar.gz` | `0c3cdce22cbd2d9508c2e87c0085029f03a112853005cc8f1ca82688430ac771` |

다운로드한 APK를 apksigner로 검증하고 aapt로 applicationId `com.flownote.remote.gesture`, versionName 0.6.0, versionCode 10, minSdk 29/targetSdk 35를 확인했다. signer SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`는 기존 0.5.2와 같다. EXE는 PE32+ Windows GUI x86-64다. APK는 최종 Android 실행, EXE/Linux는 위에서 명시한 런타임 동일 소스 실행의 산출물이다. 공개 릴리스의 동일 태그 산출물 세트로 혼동하지 않는다.

최종 Android 캡처는 `/tmp/flownote-touch-060/android-ux-final/touch-remote-android.png`, `touch-buttons-android.png`이며 동일 실행의 android-ux Actions artifact에도 있다. 대시보드와 입력창만 캡처하고 QR/등록 코드·토큰 화면은 캡처하지 않았다.

## 배포 경계

현재 요청은 입력 방식 구현이며 0.6.0 공개 태그는 발행하지 않았다. 기존 0.5.2 공개 릴리스를 덮어쓰지 않았다. main의 개발 검증은 서명 APK·단일 EXE·Linux 아카이브를 만들되 공개 Release를 생성하지 않는다. 공개 배포 시 `RELEASING.md`에 따라 동일 소스를 태그해 세 플랫폼 전체 검증과 산출물/체크섬 확인 후 게시한다. 플랫폼별 개발 검증 성공만으로 태그 릴리스를 게시하지 않는다.

네이티브 앱 전용 소스에는 Docker/Vercel/Railway 실행 target이 없어 클라우드 배포를 생략했다. 클라우드 배포 명령은 이 변경에 해당하지 않는다. 별도 앱 관리 세션 인계는 `docs/operations/app-release-handoff.md`가 이 제품을 자동 편입하지 않도록 규정한다. 원 작업 트리의 다른 사용자 변경은 되돌리거나 커밋하지 않았다. 최종 보고서만 갱신하는 커밋은 파일·주요 내용 검증 후 빌드/배포를 생략한다.
