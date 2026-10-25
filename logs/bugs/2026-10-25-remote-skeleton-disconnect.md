# Android 미리보기 직후 골격 프레임 검증으로 연결 종료

## 증상과 원인

사용자는 Android의 골격 전송을 켜 미리보기가 나온 직후 연결이 끊긴다고 보고했다. 공개 pose.jpg의 상체 영역을 실제 Pose Landmarker에 입력하면 보이지 않는 발 관절의 y가 약 2.33, visibility가 약 0.03인 출력이 나온다. 기존 서버는 모든 관절의 좌표를 -1~2로 검사한 뒤 ArgumentException을 세션 바깥까지 전달해 WebSocket을 종료했다. 사용자 기기 로그를 직접 수집한 것은 아니지만 이 동일한 실패 경로는 배포 소스 0.5.1과 실제 모델 데이터로 재현했다.

## 재현

1. SHA256 c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b의 공개 Google pose.jpg를 사용한다.
2. 정규화 crop (.4,.3,.2,.3)을 480×640에 그린 후 JPEG quality .8로 실제 고정 모델에 입력한다.
3. 화면 밖 저가시성 발 관절이 y>2인 골격을 고정 지문 TLS 카메라 세션으로 전송한다.
4. 0.5.1의 같은 테스트는 WebSocketException: remote party closed without completing the close handshake로 실패한다.

## 수정

- 골격 파싱/검증/sequence 오류만 프레임 단위로 거부하고 accepted=false/errorCode/gesture=Rejected 응답 후 다음 메시지를 계속 받는다.
- 거부한 프레임은 제스처 유지 상태를 초기화하고 마지막 정상 sequence를 변경하지 않는다. 정상 데이터·heartbeat·수동 제어로 같은 세션을 복구한다.
- 원인 코드를 서버 Activity(Windows 기록/CLI stderr)와 클라이언트 기록에 남긴다. 기기별 5초 제한과 서버 누적 개수를 사용한다. JSON/관절 좌표/영상/인증값/예외 메시지는 남기지 않는다.
- Windows 로컬 WebView도 잘못된 프레임만 버리고 카메라 허용/캡처를 유지한다.
- 좌표/크기/스키마/유한값/인증 검증을 완화하지 않는다. 원본 camera.frame과 일반 전송 규약 오류의 차단은 유지한다.

## 검증

- SkeletonRecoveryChecks: 저가시성 y=2.33, 스키마/손/크기/알 수 없는 필드/잘못된 ID/역전 sequence를 거부하고 연결 유지, 유지 판정 초기화, 정상 제스처·같은 세션 수동 제어·heartbeat 복구, 로그 빈도와 비밀값 부재를 검사한다.
- skeleton-camera-checks: 실제 모델의 상체 출력 파일을 위 TLS 복구 검사에 직접 연결한다. 고정 공개 시험 데이터는 artifacts/tests에만 두고 배포 앱에 넣지 않는다.
- Android 계측: 잘못된 프레임 거부→원인 기록→정상 프레임 복구 및 실제 후면 카메라 토글→네이티브 모델→미리보기→연결 유지 경로를 검사한다.
- Windows 검사: WebView의 잘못된 프레임 제외 후 카메라 허용과 다음 정상 프레임을 검사한다.
