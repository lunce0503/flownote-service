# Flownote Remote 0.5.1 범주별 제스처와 골격 전송

## 요청과 영향 범위

전체(연결된 모든 부분), 중간 관리(실행 에이전트/작업 선택), 세밀 조정(키보드 기본·핀치 보조)으로 제스처를 구성하고 후면 카메라 선택과 클라이언트 골격 추출/전송을 추가했다. 영향은 `flownote-remote/`의 Core, Network, Windows, Android, Linux CLI 및 네이티브 CI다. 기존 웹/API/Java 서버 런타임은 바꾸지 않는다.

## 구현과 경계

- 공통 카탈로그 11개: 전체 최소화/복원/음소거, 작업 포커스/다음/이전/상세, 핀치 음량/한손 확대/양손 확대/이동.
- Android native/Windows WebView2에서 Hand/Pose 모델로 뼈대를 표시한다. 손 관절에 제공되지 않는 visibility를 0 확률로 취급하지 않도록 실제 모델 기반 overlay 검사를 추가했다. pose visibility는 실제 모델값을 사용한다.
- 최대 16KiB 골격 메시지, 엄격한 필드/스키마/좌표/손 중복/sequence/추출 기준 검증. JPEG 업로드는 거부한다. 이전 서버의 누락된 skeletonFrames 역량을 false로 읽는다.
- 후면/선택 장치 exact, 장치 부재 시 자동 대체 금지, 선택 저장과 전면 미리보기/방향 일치.
- 핀치는 명시적 활성화·모드 선택, 기본 OFF, 집기 준비 250ms, 손실/해제 시 재준비, 제한된 변화량과 키보드 정확한 입력.
- 실제 연결된 Codex 계정 음성만 같은 사용자 Linux 서버 작업 목록에 등록·갱신·제거한다. 65초 lease/2초 검사로 비정상 종료를 정리한다. 임의 에이전트 실행/종료 권한을 추가하지 않는다.
- Windows는 단일 EXE, Android는 기존 키의 versionCode 8 APK, Linux는 tar.gz로 유지한다.

## 로컬 검증

- Core: 기존 설정/DSP 및 합성 관절 11개 동작, 유지/해제/손실/전면 방향/경계/엄격 JSON 통과.
- Network: 실제 TLS/WSS 등록/상태/권한/해제 및 골격 전체 fanout/대상 격리/키보드/응답/중복/일시 중지/영상·스키마·sequence 거부 통과.
- CLI: 실제 서버/Unix 소켓, Chromium 로컬 손 21점 추출→골격 WSS→합성 자세 명령, 작업 등록·제거 통과.
- 브라우저: 실제 손 모델/overlay, 가상 카메라 골격만 bridge, 핀치 모드, 후면 exact 오류/no fallback, 장치 해제, 로컬 QR 통과.
- Windows 검사 프로젝트 Linux 교차 빌드 통과(0경고/0오류). Windows 실제 실행은 CI에서 확인한다.
- Android unit/lintRelease/계측 코드 빌드 통과. 실제 native 모델 실행/Camera2/UI는 CI 장치 검사로 확인한다.
- Codex 기존 음성 fixture와 실제 Chromium WebRTC/Opus/PCM 검증 통과. 실제 사용자 계정 검증은 0.4.1 보고서의 증거를 유지하며 이번 기능은 계정 음성 전송 방식을 바꾸지 않는다.

## CI와 배포

- 0.5.0 준비 소스: 독립 저장소 `e17ee3482a61afb1b45f8e86f7d05828eaba2bdc`, monorepo `04fd016c2921bc85ee4572473f31489ab3a81f75`. 독립 저장소의 전체 tracked 137개 파일과 monorepo 앱 디렉터리의 바이트 일치를 확인했다.
- 독립 main staging 검증 [40147831302](https://github.com/lunce0503/flownote-remote-service/actions/runs/40147831302): Windows 단일 EXE의 실제 골격 모델·TLS/TTS·설정/라이선스·카메라 방향 선택과 재시작 복원·자기 기기 사용 토글·QR, Android 서명/기동/Camera2/네이티브 손 모델·미리보기 원본 보존·골격 그리기·합성 자세에 따른 실제 AudioManager 음소거·경고·후면 설정 복원·320dp/font1.3 UI, Linux 정확한 추출 패키지의 CLI/음성/골격 검사 모두 통과했다.
- monorepo 최종 Quality Gates [40147832825](https://github.com/lunce0503/flownote-service/actions/runs/40147832825): web/Spring/mobile/cloud-config/두 FastAPI/두 Go 총 8개 통과. Native [40147832828](https://github.com/lunce0503/flownote-service/actions/runs/40147832828): Linux/Windows/Android 3개 통과.
- 초기 독립 Windows UI 자동화가 ComboBox의 표시 TextBlock에 SelectionItemPattern을 호출해 실패했다. 명시적인 ComboBoxItem ID와 선택에 따라 갱신하는 접근성 이름을 제공해 실제 선택과 재시작 복원을 검사하도록 수정했고 최종 EXE 검사에서 통과했다. 검사 항목을 제거하지 않았다.
- 로컬 Windows 교차 빌드의 한 추가 실행은 Linux publish와 동시에 공통 프로젝트를 빌드해 PDB 복사(MSB3030)가 실패했다. 두 작업 완료 후 `dotnet build tests/Flownote.Remote.Windows.Checks -c Release -t:Rebuild -v quiet`를 단독 실행해 0경고/0오류로 통과했다. 제품 소스를 우회하지 않았다.
- `v0.5.0` 태그 workflow `40148421290`는 게시 전에 취소했고 공개 릴리스는 생성되지 않았다. 최종 검토에서 Android의 33% 반복 입력이 15단계 하드웨어에서 한 단계 달라질 수 있음을 발견해 0.5.1/versionCode 8로 보완했다. 기존 태그는 이동/삭제하지 않았다.
- 0.5.1은 정밀 입력에 stepIfUnchanged=false를 보내고 서버가 작은 핀치 변화량을 별도로 누적한다. 15단계 TLS 출력 어댑터로 반복 입력·누적·외부 음량 변경 재동기화를 검증했다. Android 실제 AudioManager 반복 적용과 후면 Camera2 입력 검사를 추가했다. 자세한 원인/회귀는 `logs/bugs/2026-10-25-remote-quantized-volume.md`를 따른다.
- 최종 0.5.1 소스: 독립 `5cded4d85751794f77c5d4724b1ff5972e858dfd`, monorepo `c0628f78de523e855791371337ad273206ad0aa5`. 두 앱 디렉터리 tracked 139개 파일의 바이트 일치를 확인했다.
- 0.5.1 staging [40148957200](https://github.com/lunce0503/flownote-remote-service/actions/runs/40148957200): 세 플랫폼 모두 통과. Windows/Linux의 새 15단계 출력 회귀 검사, Android 실제 후면 Camera2와 같은 음량의 반복 적용 검사까지 통과했다. APK 서명 SHA256은 기존 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`를 유지했다.
- 최종 monorepo Quality Gates [40148958725](https://github.com/lunce0503/flownote-service/actions/runs/40148958725) 8개 및 Native [40148958872](https://github.com/lunce0503/flownote-service/actions/runs/40148958872) 3개 모두 통과.
- 동일 소스의 v0.5.1 태그 [40149604538](https://github.com/lunce0503/flownote-remote-service/actions/runs/40149604538): Windows/Android/Linux 및 release 4개 job 모두 성공했다. [v0.5.1 시험판](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.5.1)은 isDraft=false/isPrerelease=true로 공개했고 앱 3종과 체크섬 4개 asset을 확인했다.

이 변경은 네이티브 앱/사설 골격 서버에 한정되며 Vercel/Railway 실행 산출물과 release target이 없다. 따라서 cloud staging/production 배포는 생략한다. 해당 cloud 서비스를 바꾸는 후속 변경에서만 `node scripts/deploy-cloud.mjs release <target>`을 실행한다. 네이티브 staging 검증은 독립 main의 workflow_dispatch와 monorepo 공통/플랫폼 CI로 수행한 후 동일 소스 태그를 공개한다.

## 남는 실기기 수용 범위

실제 사람의 전신·양손, 조명·거리·다양한 후면/USB 카메라, 물리 스피커/Bluetooth/원거리 VPN 지연은 별도다. 자동검사는 실제 모델의 손 관절 추출과 합성 자세의 명령 전달을 구분한다. 전체 창 제어는 Flownote Remote만, 확대/이동은 작업 패널만 포함한다. Android 최소화는 백그라운드 수집 중지로 연결도 끊으므로 사용자가 앱을 열고 재연결한다. Windows 서버에는 Linux owner socket의 음성 작업이 자동 등록되지 않으며 --native TUI 내부 세션도 자동 관찰하지 않는다.

## 추가 실제 자세 모델 확인

Google의 공개 시험 이미지 `https://storage.googleapis.com/mediapipe-assets/pose.jpg`(44,100 bytes, SHA256 `c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b`)를 저장소 밖 임시 파일로 받아 로컬 Chromium의 실제 Pose Landmarker에 입력했다. 1000×667 입력에서 자세 33점을 추출했고 양쪽 어깨/팔꿈치/손목 visibility는 1.000/1.000/0.997/0.982/0.992/0.983이었다. 이는 실제 이미지의 자세 추출 확인이며 실제 사람이 연속 동작한 품질이나 native Android 전신 인식 검증으로 대체하지 않는다. 시험 이미지나 추출 관절을 앱 패키지에 넣지 않았다.

## 공개 다운로드 검증 완료

GitHub Release에서 직접 내려받은 파일의 SHA-256을 공개 SHA256SUMS.txt와 모두 비교했다.

| 공개 파일 | bytes | SHA256 |
| --- | ---: | --- |
| Flownote-Remote-0.5.1-android.apk | 81932698 | `ac505508d734f378e318b02456d4474116bf8201a3d83cd7116476a210fe4d20` |
| Flownote-Remote-0.5.1-windows-x64.exe | 266504011 | `3cdf5d9de022686f9fd59ebb7b779fd8490c0c3d568a61706dc8f9e52de649be` |
| Flownote-Remote-0.5.1-linux-x64.tar.gz | 77659151 | `b178a1721e83bfec623c953f3b52b0536c07c2d9c22b5dc887a6a4f15e8c06fe` |
| SHA256SUMS.txt | 309 | `d1ce9358816f78cae404c3eeb28d017c8e867349831744607562332ba8f2350d` |

- Windows: 공개 파일의 MZ/PE 헤더와 machine=0x8664 확인. ZIP 대신 단일 x64 EXE다. 태그 CI는 실제 이 산출물만 있는 폴더에서 대시보드/카메라 선택 복원/설정/토글/QR를 실행했다.
- Android: 다운로드 APK에 apksigner verify 성공. package=com.flownote.remote.gesture, versionName=0.5.1, versionCode=8, minSdk=29. 서명 SHA256은 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`로 이전 릴리스와 동일하다. arm64-v8a/armeabi-v7a/x86/x86_64 native 라이브러리, 손/자세 모델, 카탈로그와 Apache 라이선스를 확인했다.
- Linux: 공개 tar.gz의 ELF, 계정 음성 worker, 제스처 문서/카탈로그를 확인했다. 추출한 정확한 바이너리를 PATH=/nonexistent로 실행해 Node 없이 private TLS 서버/소유자 소켓/골격 역량/gestures on/SIGTERM 정상 종료를 확인했다. 음성은 기존 Node/Chromium 요건을 유지한다.
- 앱 패키지에 session.json/시험 손·자세 이미지/auth.json/서버 PFX/등록 파일/소켓/서명키가 포함되지 않았음을 파일 목록으로 확인했다.
- Windows 넓은/좁은 화면과 Android 320dp/font1.3의 실제 CI 화면을 검토했다. 등록 QR/토큰 화면을 배포 파일이나 UX artifact에 넣지 않았다.

최종 기록 커밋은 이 보고서와 관련 버그 검증 결과만 갱신하며 앱 소스는 위 staging/tag와 동일하게 유지한다. Vercel/Railway 런타임 및 Docker 대상이 없는 네이티브 앱 변경이므로 cloud 배포는 진행하지 않는다.
