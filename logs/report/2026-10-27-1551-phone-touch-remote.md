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

## 플랫폼 검증 상태

독립 저장소 main 소스 `aef41a5b949913ed1622d75fb624290e1a25b831`의 검증 [40534993719](https://github.com/lunce0503/flownote-remote-service/actions/runs/40534993719)를 실행했다. 이 기록 작성 시 Windows/Android/Linux 작업 진행 중이다. 최종 결과와 후속 소스는 확인 후 이 문서에 갱신한다. 접수·빌드 시작을 완료로 기록하지 않는다.

## 배포 경계

현재 요청은 입력 방식 구현이며 0.6.0 공개 태그는 아직 발행하지 않았다. 기존 0.5.2 공개 릴리스를 덮어쓰지 않는다. 플랫폼 검증 workflow는 서명 APK·단일 Windows EXE·Linux 아카이브를 생성하되 main 실행은 공개 Release를 만들지 않는다. 공개 배포 시 동일 검증 소스에 `git tag v0.6.0 && git push origin v0.6.0`을 사용한다.

네이티브 앱 전용 소스에는 Docker/Vercel/Railway 실행 target이 없어 클라우드 배포를 생략한다. 클라우드 배포 명령은 이 변경에 해당하지 않는다. 별도 앱 관리 세션 인계는 `docs/operations/app-release-handoff.md`가 이 제품을 자동 편입하지 않도록 규정한다. 원 작업 트리의 다른 사용자 변경은 되돌리거나 커밋하지 않는다.
