# Flownote Remote 0.5.2 골격 오류 후 연결 유지

## 범위와 처리

사용자 요청은 잘못된 골격 프레임만 제외하고 연결 유지, 원인 로그, 재현 검사와 새 릴리스다. Core의 검증 원인 코드, Network 프레임 거부 응답/진단, Android와 Windows의 표시/로그, 검증과 소유 문서를 변경한다. 원본 영상·좌표·인증값을 로그에 기록하지 않으며 기기별 5초로 반복을 제한한다. Windows 단일 EXE/기존 키의 Android versionCode 9 APK/Linux CLI tar.gz/체크섬 배포 정책을 유지한다.

## 재현과 로컬 확인

- 실제 공개 pose.jpg 상체 crop (.4,.3,.2,.3), 480×640/JPEG .8의 고정 모델 출력에서 숨은 발 관절 y>2를 재현했다. 이 출력으로 0.5.1 소스의 TLS 세션을 검사하면 WebSocketException으로 실패한다. 회귀 검사 실패가 기존 문제를 잡는 것을 먼저 확인했다.
- 수정 후 Core/Network 검사와 실제 모델→같은 TLS 세션의 오류 거부→정상 제스처/수동 제어/heartbeat 복구, 안전한 원인 로그 검사가 통과했다.
- Windows 검사 프로젝트 교차 빌드는 0경고/0오류로 통과했다. 실제 WebView/패키지 실행은 CI에서 검사한다.
- Android unit/lintRelease/계측 코드 빌드를 통과했다. 실제 후면 카메라 토글과 네이티브 모델/미리보기/오류 후 연결 유지 계측은 CI에서 검사한다.
- 한 초기 실행은 상위 서비스 디렉터리에서 앱 전용 Node 스크립트를 실행해 MODULE_NOT_FOUND가 발생했다. flownote-remote 작업 디렉터리에서 같은 명령을 실행해 통과했다. 소스 오류를 우회하지 않았다.

## 계약과 경계

skeleton.result에 accepted/errorCode를 추가한다. 이전 서버에서 accepted가 없으면 기존 성공 응답으로 처리한다. 실패한 프레임의 상관 ID는 유지하며 잘못된 ID는 Guid.Empty다. 거부 시 제스처 유지 상태를 초기화하고 마지막 정상 sequence를 유지한다. 표준 JSON 파싱/전송 최대 크기 등 일반 전송 규약과 원본 영상 경로 차단은 유지한다. 자세한 계약과 코드 목록은 flownote-remote/docs/NETWORK.md가 소유한다.

서버가 해당 프레임 전체를 거부하므로 모든 프레임에서 관절이 범위를 벗어나면 구도 조정 전에는 제스처를 실행하지 않는다. 수동 제어와 연결은 유지된다. 실물 스마트폰/조명/원거리 VPN 품질은 자동화 검사와 구별한다.

## CI와 릴리스

독립 저장소 main staging, monorepo 공통/Native CI를 통과한 같은 앱 소스로 새 태그를 게시한 뒤 공개 파일의 체크섬/APK 서명/버전/EXE 형식을 검증한다. 실행 ID와 최종 결과는 완료 후 갱신한다.

이번 변경은 네이티브 앱과 사설/VPN 서버에 한정되며 웹/API/Docker/Vercel/Railway 실행 산출물이나 배포 target이 없다. 따라서 cloud staging/production 배포는 진행하지 않는다. 필요한 cloud 서비스를 바꾸는 후속 작업에서만 node scripts/deploy-cloud.mjs release <target>을 사용한다.
