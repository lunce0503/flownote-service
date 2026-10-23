# Flownote Remote 0.3.0 대시보드와 QR 연결

## 요청과 변경

사용자 요청에 따라 자주 쓰는 기능을 먼저 보여 주고 클라이언트 목록에는 사용 토글·이름·연결 기능을 요약한다. 세부 설정은 `⋯`로 옮기고 QR/연결 코드를 제공한다. 영향 범위는 Android/Windows 네이티브 `flownote-remote`와 소유 문서이며 기존 웹·인증·클라우드 서비스 코드는 바꾸지 않았다.

- 시작 화면: 소리, 카메라, 제스처, 음성 알림 카드. Windows는 화면 폭에 따라 2열/1열로 전환하고 작업 영역 안에서 창을 연다. Android는 세로 카드·목록과 48dp 이상 조작 영역을 사용한다.
- 클라이언트 행: 토글·이름·실제 출력/카메라/알림/제어 대상 요약과 기기별 `⋯`. 연결 안 됨, 사용자 일시 중지, 서버 사용 금지, 출력 장치 오류를 구별한다. 등록 기기가 오프라인이어도 서버 목록에 남겨 관리한다.
- 권한: 서버는 사용 허용을 저장하고 클라이언트는 자기 참여만 중지/재개한다. 서버의 금지를 기기에서 해제할 수 없다. 중지 중에는 카메라·명령·출력을 차단하면서 heartbeat는 유지하고 재개해도 카메라를 자동 켜지 않는다. 기존 등록의 Allowed 기본값을 true로 유지한다.
- 세부 메뉴: 제스처 설정, 서버 주소 설정, 연결 기록/오류 상세, 연결 해제/서버 중지, 라이선스. 기기 메뉴에는 대상 선택·상세·관리 권한에 따른 등록 해제를 둔다.
- 쉬운 연결: 서버의 2분·일회용 QR, Android/Windows의 로컬 카메라 판독, 연결 코드 복사/붙여넣기, 수동 주소·지문 입력, 암호화 저장된 서버 재연결. 읽은 뒤 사용자 확인을 거쳐야 등록한다. 취소/백그라운드 전환 뒤 늦게 온 응답으로 자동 연결하지 않는다.

QR은 v1 URI의 주소·지문·코드·만료 시각만 담는다. 장기 토큰을 넣지 않고 외부 QR 서비스나 임의 URL 실행을 사용하지 않는다. TLS pinning·유효 기간·코드 재사용 방지를 유지한다. QR/코드/토큰 화면은 screenshot artifact로 남기지 않는다. UI 역할·행동은 `flownote-remote/docs/UX.md`, 보안·메시지 계약은 `flownote-remote/docs/NETWORK.md`, 서비스 제품 사양은 `docs/product-specs/gesture-remote-app.md`에 반영했다. frontend-ux-review, security-review, api-contract-review 기준을 적용했다.

음원 전송·분리/합성·화면/프로젝터·대화형 AI는 이번 작업 범위가 아니며 사용 중이라고 표시하지 않는다. 상태 알림은 기존 OS TTS 경로를 유지한다. Android의 숨겨진 제스처 상세 설정은 이 기기의 합성 검사이며 실제 인식 정책은 서버 PC가 소유한다.

## 검증

- .NET Core/Network 실행 검사 통과: 설정/필터/DSP, 공통 QR 유효/무효 벡터, 기존 등록 기본값, 실제 TLS/WSS·지문/재사용 거부·출력 응답·일시 중지/재개·서버 금지 우회 거부·등록 해제.
- Windows/Fixture 교차 빌드 0 warning / 0 error. Linux에서 Windows UI가 실행됐다고 간주하지 않는다.
- Android `testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest` 및 마지막 instrumentation 소스 컴파일 통과. 새 문자열 경고를 수정했고 기존 AndroidX 테스트 의존성 새 버전 안내 2개는 오류가 아니다.
- 최종 [서비스 공통 CI](https://github.com/lunce0503/flownote-service/actions/runs/39984263470) 8개 job과 [원격 앱 CI](https://github.com/lunce0503/flownote-service/actions/runs/39984263468) Windows/Android 2개 job 통과. 검증 SHA `d35f907a9bc9a62789fcef9a0cd5310fd71a3eca`.
- 실제 Windows 검사: QR 픽셀 생성→판독, WebView2/MediaPipe 실제 모델, TLS→제스처 게이트→출력 시험 어댑터 응답, 실제 OS TTS WAV 합성. 정확한 단일 EXE에서 대시보드·메뉴·설정/라이선스·재시작 복원·서버/로컬 클라이언트·접근성 토글·QR 패널을 검사한다.
- 실제 Android 10 검사: QR Bitmap 판독→초대 파싱→고정 지문 TLS, Camera2 프레임, 실제 Chromium/MediaPipe, AudioManager 음량 변화, 배터리/연결 알림. 320dp·font scale 1.3에서 메뉴·저장된 연결 재접속·실제 목록/기기 토글·확인 없는 등록 차단을 검사한다.
- 실제 Windows screenshot 4개를 넓은/420px 창, 상단 카드/하단 목록에서 확인했다. 초기 화면 잘림은 작업 영역 제한으로 수정했다. Android screenshot 2개를 320dp·font1.3의 상단/목록에서 확인했고 `⋯`의 기본 최소 너비가 크게 잡히는 문제를 48dp 아이콘 버튼으로 수정했다. 최종 기기 이름/요약이 넓어진 영역에 표시되고 전체 이름은 접근성 이름으로 유지한다.
- 소유 문서의 상대 링크, 로컬 앱과 독립 저장소의 추적 소스 해시 일치 확인을 통과했다.

컴파일 이름 충돌, UI 상태/카메라 중지 순환 방지, stale session 이벤트, 작은 창 경계, 모달 종료 대기, 에뮬레이터 QR 별칭, screenshot 수집 경로는 `logs/bugs/2026-10-24-remote-dashboard-qr-validation.md`에 명령/실패 이유/수정 방향을 기록했다. Android의 실제 UI 검사 자체는 39979087663에서 통과했지만 screenshot 수집 단계가 실패해 전체 게시를 진행하지 않았다.

독립 저장소의 [초기 전체 수용 검사](https://github.com/lunce0503/flownote-remote-service/actions/runs/39982408964) 후 실제 이미지를 검토해 Android 메뉴 너비를 개선했다. 최종 [수용 검사](https://github.com/lunce0503/flownote-remote-service/actions/runs/39984256869)는 소스 `484f91376ea7aa0d8447667dbaecb998f7231729`에서 Windows/Android 모두 통과했다. APK 실행 시 카메라 권한을 자동 요청하지 않으며 단위/실제 OS/프로토콜/기능·UX 검사를 함께 유지했다.

같은 소스에 `v0.3.0`을 만들고 [태그 릴리스 실행](https://github.com/lunce0503/flownote-remote-service/actions/runs/39985420121)의 Windows/Android/release 3개 job을 모두 통과했다. 태그 SHA는 `484f91376ea7aa0d8447667dbaecb998f7231729`이며 [0.3.0 시험판](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.3.0)은 isDraft=false / isPrerelease=true로 공개됐다. Android 브라우저 검증 환경 준비가 길어졌지만 같은 태그에서 전체 검사를 완료한 뒤 게시했다.

## 공개 파일 확인

공개 파일을 저장소 밖의 새 임시 폴더로 다운로드하고 종료 코드 0 뒤 검증했다.

- `sha256sum -c SHA256SUMS.txt`: APK/EXE 둘 다 OK.
- `apksigner verify --verbose --print-certs`: 성공. 인증서 SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`로 기존 릴리스와 같다.
- `aapt dump badging`: `com.flownote.remote.gesture`, 0.3.0 / versionCode 4, minSdk 29 / targetSdk 35.
- EXE의 MZ/PE header와 x64 machine(0x8664) 확인. APK의 session.json·thumb_up.jpg·pairing-links.json 부재 확인.
- 공개 파일은 APK 3,521,547 bytes / EXE 252,827,467 bytes / SHA256SUMS.txt 204 bytes의 3개다. ZIP이나 UX 이미지는 Release 자산에 없다.
- 로컬 앱·독립 저장소·서비스 저장소 앱의 추적 파일 해시가 일치하고 게시용 체크아웃은 깨끗하다. 마지막 서비스 커밋은 이 결과 보고서만 추가하므로 `[skip ci]`를 사용하며 검증된 실행 소스/CI SHA는 위에 기록했다.

## 배포와 제한

공개 릴리스는 기존 서명키를 유지하는 versionCode 4의 0.3.0 APK, Windows 단일 EXE, SHA256SUMS.txt만 게시한다. UX 이미지는 Actions artifact로 분리하고 public release에는 포함하지 않는다. .NET·모델·라이선스는 EXE 안에 있고 WebView2 Runtime은 Windows PC에 필요하다. 기존 릴리스/파일/태그를 덮어쓰거나 삭제하지 않는다.

물리 카메라로 다른 화면의 QR을 읽는 광학 품질·실제 스피커 청취·Bluetooth·원거리 VPN 지연은 별도 실기기 수용 항목이다. Windows 출력 시험 어댑터와 Android 에뮬레이터의 실제 OS 볼륨 변화는 이 물리 검증과 구별한다.

이 변경은 네이티브 앱이므로 Vercel/Railway 실행 산출물과 배포 target이 없다. cloud staging E2E/production 배포를 생략하고 앱의 실제 OS 수용 검사와 GitHub APK/EXE 배포를 사용한다. 웹 다운로드 페이지를 바꿀 때는 `node scripts/deploy-cloud.mjs release web`으로 staging 검증 후 같은 소스를 production에 반영한다. 이번에는 웹 다운로드 페이지를 변경하지 않았다.

기존 다수의 로컬 웹·모바일·인증 변경을 보존하고 격리된 두 Git 체크아웃에서 앱·제품 사양·버그/결과만 선택해 업로드했다. 원래 작업 폴더의 인덱스나 관련 없는 변경을 되돌리지 않았다.
