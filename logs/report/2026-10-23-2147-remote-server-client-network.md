# Flownote Remote PC 서버와 입출력 클라이언트

## 요구와 구현

2026-10-23 사용자 요구: Windows 컴퓨터가 서버를 실행하고 Android/Windows 클라이언트가 카메라·음원·조작 UI·화면/프로젝터 입출력을 담당한다. 서버는 제스처·음원 처리·화면 배치·비서 작업을 관리하고 상태 위험/알림을 음성으로 전달한다. 이 네이티브 앱에 한해 PC 서버와 사설/VPN HTTPS/WSS 직접 통신을 허용한다. 기존 웹/API의 cloud 전용 통신 정책은 변경하지 않는다.

0.2.0의 첫 실행 경로는 실제 카메라 JPEG → PC MediaPipe 모델 → 서버 GestureGate → 인증된 출력 클라이언트의 OS 음량/음소거 API → 적용 응답이다. 기기 등록은 지문 대조와 2분 일회용 코드, 기기별 토큰을 사용한다. 최대 8기기, 등록 해제·명령 중복 방지·프레임 ID·크기/속도 제한·heartbeat를 구현한다. Windows DPAPI와 Android Keystore로 자격 증명을 보관하며 서버는 토큰 해시만 보관한다.

배터리 부족, Windows 메모리 압박, 출력/분석 실패, 연결 끊김을 화면과 OS TTS 음성으로 알린다. 한국어 로컬 음성 우선, 영어 대체와 화면 fallback을 제공한다. 경고는 실제 상태 규칙으로 즉시 처리하며 LLM 응답을 기다리지 않는다. 카메라와 제스처 명령은 기본 자동 실행하지 않고 Android 백그라운드·연결 종료·창 닫기에서 수집을 중지한다.

음원 스트리밍·분리/합성, 화면 합성/배치·프로젝터 출력, 대화형 AI 제공자는 아직 연결 전이다. 프로토콜 역량을 false로 표시한다. 기존 Sound Manager DSP는 유지하되 실제 음원 처리 출력이 완성됐다고 설명하지 않는다.

소유 명세: `flownote-remote/docs/NETWORK.md`, 제품 사양: `docs/product-specs/gesture-remote-app.md`. `docs/DESIGN.md`, `ARCHITECTURE.md`, 앱 README/릴리스/서드파티 문서를 함께 갱신했다. `AGENTS.md`의 PC 서버 금지 규칙에는 사용자 요구에 따른 이 앱만의 예외를 기록해 다음 작업에서도 역할이 보존되도록 했다. feature-planning, security-review, api-contract-review 체크리스트를 사용했다.

## 검증 근거

- Linux .NET Core/Network 검사 통과: 실제 HTTPS/WSS, 잘못된 지문·코드 재사용·해제된 자격 증명 거부, heartbeat·배터리 알림·명령/출력 응답·중복 방지. 인증서를 다시 내보내 보관할 수 있는지도 검사한다.
- Windows 교차 빌드: 0 warning / 0 error. Linux에서 WPF 실행을 검증했다고 간주하지 않는다.
- Android `testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest` 통과. 기기용 instrumentation APK 컴파일과 실제 실행은 구별한다.
- 서비스 [초기 공통 CI](https://github.com/lunce0503/flownote-service/actions/runs/39954893208) 8개 job과 [원격 앱 CI](https://github.com/lunce0503/flownote-service/actions/runs/39954893104) 2개 job 통과. Windows 실제 WebView2/MediaPipe는 Thumb_Up 0.746을 반환했고 기본 80%에서 차단, 테스트 서버에만 설정한 70%에서는 한 번 실행했다. 실제 OS TTS WAV 합성도 통과했다.
- 독립 저장소 첫 Android 기기 검사(39954489735의 Android job): 서명 APK 설치/실행, 자동 카메라 권한 미요청, Android 10에서 1개 instrumentation 검사 통과. Camera2 실제 가상 장치 프레임, 동일 실제 모델, AudioManager 실제 미디어 음량 변화, 배터리/예상치 못한 연결 종료를 확인했다.
- Windows 모델/네트워크 검사의 출력은 시험 어댑터이며 물리 오디오 장치의 음량/청취 검증과 구별한다. Android 실제 OS API 검사도 물리 스피커 청취, 실제 카메라 환경/조명, Bluetooth, VPN 지연 검증을 대신하지 않는다.

## 오류 수정과 최종 상태

`logs/bugs/2026-10-23-remote-network-acceptance.md`에 Minimal API 응답 추론, AndroidX 설정, 최신 .NET NU1510, Windows 인증서 재내보내기/Schannel 호환성 수정과 재검증 경로를 기록한다. 배포할 EXE 자체의 TLS 서버 시작까지 통과한 소스만 공개 릴리스로 게시한다.

최종 기능 소스는 독립 저장소 `cbf6d4b5e50c60a849bff4f564b64b08d6883e2a`, 서비스 저장소 `6dcbf4a2e70861183247e78efda42f0d2434e836`이다. 서비스의 [공통 CI](https://github.com/lunce0503/flownote-service/actions/runs/39955780628) 8개와 [원격 앱 CI](https://github.com/lunce0503/flownote-service/actions/runs/39955780625) 2개 job을 모두 통과했다.

독립 저장소 [릴리스 사전 수용 검사](https://github.com/lunce0503/flownote-remote-service/actions/runs/39955774057)도 Windows/Android 모두 통과했다. Windows EXE 하나만 둔 새 폴더에서 라이선스·설정 재시작 복원·내장 WebView2/MediaPipe 모델·TLS 서버·인증된 로컬 클라이언트 시작을 확인했다. Android 10의 실제 Camera2/모델/AudioManager instrumentation 1개가 다시 통과했다.

릴리스 노트의 링크만 태그 절대 URL로 정정한 독립 저장소 `50a614647019d94f66269ecdfc8c0df595c18fcf`에 `v0.2.0`을 만들었다. [태그 릴리스 검사](https://github.com/lunce0503/flownote-remote-service/actions/runs/39956620475)의 Windows/Android/release 3개 job이 모두 성공했다. 같은 소스에서 전체 수용 검사를 다시 수행한 뒤 [0.2.0 시험판](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.2.0)을 공개했다. isDraft=false / isPrerelease=true이며 기존 릴리스·파일은 삭제하지 않았다.

공개 파일을 별도 임시 폴더에 다운로드한 뒤 다음을 확인했다.

- `sha256sum -c SHA256SUMS.txt`: APK/EXE 모두 OK.
- `apksigner verify --verbose --print-certs`: 서명 검증 성공. 인증서 SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`로 기존 릴리스와 같다. 비공개 키는 공개하지 않았다.
- `aapt dump badging`: `com.flownote.remote.gesture`, versionName 0.2.0 / versionCode 3, minSdk 29 / targetSdk 35.
- EXE MZ/PE 헤더 및 x64 machine(0x8664) 확인. 공개 파일은 APK 3,034,272 bytes / EXE 252,269,839 bytes / checksum 3개이며 ZIP은 없다.
- release APK에 androidTest의 session.json·thumb_up.jpg가 없는지 확인했다. 로컬 앱과 독립 저장소의 추적 파일 해시가 일치하고 주요 문서의 상대 링크도 통과했다.
- 다운로드 프로세스 종료 전에 먼저 실행한 SHA-256 중간 검사는 아직 쓰는 중인 EXE에서 실패했다. 다운로드 종료 코드 0을 확인한 뒤 같은 명령을 다시 실행해 두 파일 모두 통과했다. 배포 파일 손상으로 판단하지 않았다.

후속 서비스 커밋은 실행 코드가 바뀌지 않는 AGENTS의 네이티브 예외, 릴리스 노트 링크, 버그/결과 기록만 포함한다. `[skip ci]`를 사용하며 검증된 실행 소스의 CI SHA는 위에 기록했다.

Windows 공개 산출물은 단일 EXE를 유지한다. 모델과 .NET은 EXE에 포함하며 PC에는 WebView2 Evergreen Runtime이 필요하다. 서명 파일·비밀값·모델 다운로드 캐시·시험 등록 코드/이미지는 Git/공개 release에 포함하지 않는다.

## 클라우드 배포와 작업 보존

이 변경에는 Vercel/Railway 런타임 산출물과 배포 target이 없다. PC 네이티브 앱은 GitHub의 EXE/APK로 배포하고 웹/백엔드 cloud 배포는 생략한다. 따라서 cloud staging E2E·production deployment id는 해당 없음이며 Windows/Android 실제 런타임 수용 검사를 수행한다. 웹 다운로드 페이지를 향후 변경하면 `node scripts/deploy-cloud.mjs release web`으로 staging 검증 후 같은 소스를 production에 배포한다.

기존 다수의 웹·모바일·인증 로컬 변경을 보존하고, 두 저장소의 격리된 체크아웃에서 이 앱과 소유 문서·검증 파일만 선택해 커밋/업로드했다. 부모 로컬 인덱스를 변경하거나 기존 작업을 되돌리지 않았다.
