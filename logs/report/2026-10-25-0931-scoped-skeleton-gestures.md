# Flownote Remote 0.5.0 범주별 제스처와 골격 전송

## 요청과 영향 범위

전체(연결된 모든 부분), 중간 관리(실행 에이전트/작업 선택), 세밀 조정(키보드 기본·핀치 보조)으로 제스처를 구성하고 후면 카메라 선택과 클라이언트 골격 추출/전송을 추가했다. 영향은 `flownote-remote/`의 Core, Network, Windows, Android, Linux CLI 및 네이티브 CI다. 기존 웹/API/Java 서버 런타임은 바꾸지 않는다.

## 구현과 경계

- 공통 카탈로그 11개: 전체 최소화/복원/음소거, 작업 포커스/다음/이전/상세, 핀치 음량/한손 확대/양손 확대/이동.
- Android native/Windows WebView2에서 Hand/Pose 모델로 뼈대를 표시한다. 손 관절에 제공되지 않는 visibility를 0 확률로 취급하지 않도록 실제 모델 기반 overlay 검사를 추가했다. pose visibility는 실제 모델값을 사용한다.
- 최대 16KiB 골격 메시지, 엄격한 필드/스키마/좌표/손 중복/sequence/추출 기준 검증. JPEG 업로드는 거부한다. 이전 서버의 누락된 skeletonFrames 역량을 false로 읽는다.
- 후면/선택 장치 exact, 장치 부재 시 자동 대체 금지, 선택 저장과 전면 미리보기/방향 일치.
- 핀치는 명시적 활성화·모드 선택, 기본 OFF, 집기 준비 250ms, 손실/해제 시 재준비, 제한된 변화량과 키보드 정확한 입력.
- 실제 연결된 Codex 계정 음성만 같은 사용자 Linux 서버 작업 목록에 등록·갱신·제거한다. 65초 lease/2초 검사로 비정상 종료를 정리한다. 임의 에이전트 실행/종료 권한을 추가하지 않는다.
- Windows는 단일 EXE, Android는 기존 키의 versionCode 7 APK, Linux는 tar.gz로 유지한다.

## 로컬 검증

- Core: 기존 설정/DSP 및 합성 관절 11개 동작, 유지/해제/손실/전면 방향/경계/엄격 JSON 통과.
- Network: 실제 TLS/WSS 등록/상태/권한/해제 및 골격 전체 fanout/대상 격리/키보드/응답/중복/일시 중지/영상·스키마·sequence 거부 통과.
- CLI: 실제 서버/Unix 소켓, Chromium 로컬 손 21점 추출→골격 WSS→합성 자세 명령, 작업 등록·제거 통과.
- 브라우저: 실제 손 모델/overlay, 가상 카메라 골격만 bridge, 핀치 모드, 후면 exact 오류/no fallback, 장치 해제, 로컬 QR 통과.
- Windows 검사 프로젝트 Linux 교차 빌드 통과(0경고/0오류). Windows 실제 실행은 CI에서 확인한다.
- Android unit/lintRelease/계측 코드 빌드 통과. 실제 native 모델 실행/Camera2/UI는 CI 장치 검사로 확인한다.
- Codex 기존 음성 fixture와 실제 Chromium WebRTC/Opus/PCM 검증 통과. 실제 사용자 계정 검증은 0.4.1 보고서의 증거를 유지하며 이번 기능은 계정 음성 전송 방식을 바꾸지 않는다.

## CI와 배포

독립 저장소 main `1e56fb58dff0ff7eb0edd0ac222434e8c044d621`의 실행 `40147094312`에서 Windows EXE/Android 서명 APK/Linux 패키지 검증 진행 중. 완료 후 정확한 소스·릴리스·실행 ID·다운로드 검증 결과를 갱신한다.

이 변경은 네이티브 앱/사설 골격 서버에 한정되며 Vercel/Railway 실행 산출물과 release target이 없다. 따라서 cloud staging/production 배포는 생략한다. 해당 cloud 서비스를 바꾸는 후속 변경에서만 `node scripts/deploy-cloud.mjs release <target>`을 실행한다. 네이티브 staging 검증은 독립 main의 workflow_dispatch와 monorepo 공통/플랫폼 CI로 수행한 후 동일 소스 태그를 공개한다.

## 남는 실기기 수용 범위

실제 사람의 전신·양손, 조명·거리·다양한 후면/USB 카메라, 물리 스피커/Bluetooth/원거리 VPN 지연은 별도다. 자동검사는 실제 모델의 손 관절 추출과 합성 자세의 명령 전달을 구분한다. 전체 창 제어는 Flownote Remote만, 확대/이동은 작업 패널만 포함한다. Android 최소화는 백그라운드 수집 중지로 연결도 끊으므로 사용자가 앱을 열고 재연결한다. Windows 서버에는 Linux owner socket의 음성 작업이 자동 등록되지 않으며 --native TUI 내부 세션도 자동 관찰하지 않는다.
