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

독립 저장소 main staging, monorepo 공통/Native CI를 통과한 같은 앱 소스로 새 태그를 게시한 뒤 공개 파일의 체크섬/APK 서명/버전/EXE 형식을 검증한다. 실행 결과는 다음과 같다.

- 앱 소스: 독립 `c2fa1f64790dd8335bd2dfa0cb2292da1545a922`, monorepo `d86e2ee940cefa220977d9d013fd711ba9e5933f`. tracked 앱 파일 142개를 비교해 바이트 차이가 없음을 확인했다.
- 독립 main staging [40154993975](https://github.com/lunce0503/flownote-remote-service/actions/runs/40154993975): Windows/Linux/Android 모두 성공. 실제 모델의 경계 입력→TLS 복구, Windows WebView의 카메라 허용/다음 프레임, Android native 잘못된 프레임/원인 로그/수신 복구와 실제 후면 카메라 토글→모델→미리보기→연결 유지 검사를 통과했다.
- monorepo Quality Gates [40154995157](https://github.com/lunce0503/flownote-service/actions/runs/40154995157) 8개 및 Native [40154995149](https://github.com/lunce0503/flownote-service/actions/runs/40154995149) 3개 모두 통과했다.
- 동일 소스의 `v0.5.2` 태그 [40155551984](https://github.com/lunce0503/flownote-remote-service/actions/runs/40155551984)는 Windows/Linux/Android/release 4개 job 모두 성공했다. [v0.5.2 시험판](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.5.2)을 isDraft=false/isPrerelease=true로 공개했고 배포 파일 4개를 확인했다.

이번 변경은 네이티브 앱과 사설/VPN 서버에 한정되며 웹/API/Docker/Vercel/Railway 실행 산출물이나 배포 target이 없다. 따라서 cloud staging/production 배포는 진행하지 않는다. 필요한 cloud 서비스를 바꾸는 후속 작업에서만 node scripts/deploy-cloud.mjs release <target>을 사용한다.

## 공개 파일 재검증

GitHub Release에서 파일을 직접 내려받아 공개 SHA256SUMS.txt와 비교했다. 세 파일 모두 일치했다.

| 파일 | bytes | SHA256 |
| --- | ---: | --- |
| Flownote-Remote-0.5.2-android.apk | 81932698 | `8a7f659d335e47bcb081873d2e024c80ba38fc14b441e2d1290069426bd7d30d` |
| Flownote-Remote-0.5.2-windows-x64.exe | 266508107 | `e8bb7c1c185ea81a7cae4e0f1d2ceacb8396d5bdbb472ada28c6036a54d431e7` |
| Flownote-Remote-0.5.2-linux-x64.tar.gz | 77663055 | `aabb36f4128f14775eae22f2dccb6bf76b5c9259c6486e6ff6feec3f53b9ef35` |
| SHA256SUMS.txt | 309 | `db36f0e4a75e866f7b95b64b899fb2234d7aa50e63933d737a8df849af15e516` |

- Windows 공개 파일은 MZ/PE x64(machine=0x8664) 단일 EXE다. 같은 태그의 정확한 패키지 실행 검사를 통과했다.
- 공개 APK는 apksigner verify 성공, versionName=0.5.2/versionCode=9/minSdk=29이며 기존 서명 SHA256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`를 유지한다. DEX에 새 landmark_out_of_range 진단 코드가 포함돼 있음을 확인했다. Native ABI는 arm64-v8a/armeabi-v7a/x86/x86_64다.
- 공개 Linux tar.gz의 ELF/문서/카탈로그/계정 음성 worker를 확인했다. 추출한 바이너리를 PATH=/nonexistent로 실행해 Node 없이 private 서버·소유자 소켓·골격 역량·gestures on·SIGTERM 정상 종료를 재확인했다.
- APK/Linux archive의 파일 목록에 시험 이미지/세션 JSON/인증 JSON/서버 PFX/서명키가 포함되지 않았음을 확인했다. 모델과 라이선스/카탈로그는 포함한다.
- 서버와 Android 클라이언트를 모두 0.5.2로 바꾸고 서버 프로세스를 재시작해야 새 서버 거부/복구 처리가 적용된다. 기존 기기 등록·서명키·설정은 유지한다.

최종 커밋은 보고서와 버그 기록만 갱신한다. 실행 소스는 staging/tag와 동일하며 네이티브 전용 변경이므로 Docker/Vercel/Railway 배포는 생략했다.
