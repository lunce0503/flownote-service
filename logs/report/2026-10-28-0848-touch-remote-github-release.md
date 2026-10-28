# Flownote Remote 0.6.1 GitHub 시험 릴리즈

## 공개 결과

사용자 요청에 따라 [v0.6.1](https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.6.1)을 2026-10-28 08:57:31 UTC에 공개했다. isDraft=false, isPrerelease=true이며 공개 파일은 Android APK·Windows 단일 EXE·Linux x64 tar.gz·SHA256SUMS.txt의 정확히 4개다. 기존 시험판 채널을 유지했다.

제스처를 중지하고 휴대폰의 십자·그리드 드래그 영역과 아이콘·짧은 이름의 커스텀 버튼 리스트를 제공한다. 상세 동작은 [TOUCH.md](../../flownote-remote/docs/TOUCH.md), 구현 검증은 [기능 보고서](2026-10-27-1551-phone-touch-remote.md)를 따른다. 서버와 Android/Windows 클라이언트를 함께 업데이트하고 서버를 재시작한다.

## 동일 소스와 게이트

- 독립 저장소 main/태그 v0.6.1: `489def2b4cab649297666a230f2ef3d959ab723c`.
- 서비스 저장소 같은 앱 소스: `94428512c669415fad0527c3e0e21219486ef221`. 세 작업 트리의 154개 앱 파일이 바이트 단위로 같다.
- [태그 릴리즈 40659641295](https://github.com/lunce0503/flownote-remote-service/actions/runs/40659641295): Windows/Android/Linux/release 모두 성공. 플랫폼별 개발 산출물을 섞지 않고 같은 태그의 세 플랫폼 artifact로 게시했다.
- [공통 CI 40659699478](https://github.com/lunce0503/flownote-service/actions/runs/40659699478): 8개 작업 모두 성공.
- [네이티브 CI 40659699690](https://github.com/lunce0503/flownote-service/actions/runs/40659699690): Windows/Android/Linux 모두 성공.

Windows는 실제 SendInput 커서/클릭/드래그·해제, WebView 모델/TTS와 패키징한 EXE의 실행/설정/QR을 검사했다. Android는 서명 APK 설치와 카메라 권한 자동 미요청, Android 10에서 실제 입력창의 탭/이동/드래그/hold/up 및 저장한 커스텀 버튼의 TLS 명령 전달을 통과했다. Linux는 서버/TLS/CLI/실제 모델/계정 음성 fixture 및 압축을 푼 정확한 실행 파일을 검사했다. 물리 휴대폰·물리 PC·원거리 VPN 조합은 이 러너/에뮬레이터 검증과 구별한다.

## 게시 전 수정

0.6.0 릴리즈 준비 중 이전 개발 tar.gz의 docs/TOUCH.md 누락을 재현했다. 태그 실행 40659435107을 공개 전에 취소하고 이미 올린 태그를 덮어쓰지 않았다. 0.6.1/versionCode 11에서 복사 목록과 test -f 필수 포함 검사를 보완했다. 공개 tar.gz에도 이 문서가 있음을 확인했다. [버그 기록](../bugs/2026-10-28-remote-linux-touch-guide.md)을 따른다.

README/CLI의 다운로드 버전을 정정하고 공개 릴리즈 본문에 태그의 절대 문서 링크를 사용했다. 버전·릴리스 노트 일치 검사와 shell 구문 검사를 통과했다.

## 공개 파일 검증

게시 후 네 공개 파일을 GitHub Release에서 내려받아 SHA256SUMS.txt의 세 바이너리 해시를 재계산했다.

| 파일 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Flownote-Remote-0.6.1-android.apk | 81,949,140 | `96d9bde9705f8a0c8b4381370c523a5d0b4b4ffb7fdb85bc402d694ebdda4444` |
| Flownote-Remote-0.6.1-windows-x64.exe | 266,524,491 | `1455f34c494f4109d1f4d5b2b158640549ae27ba6e8f31fbfb2047c4c0129e64` |
| Flownote-Remote-0.6.1-linux-x64.tar.gz | 77,657,239 | `c27df097b7bb5d52141588d585cbb01c04a19c5fb19189fbd67c8314abba152a` |

APK는 apksigner verify 성공, applicationId com.flownote.remote.gesture, versionName 0.6.1, versionCode 11, minSdk 29/targetSdk 35다. signer SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`는 기존 0.5.2/0.6.0 검증 빌드와 같다. DEX의 TouchRemoteDialog/TouchPadView/pointer.hold와 네 ABI의 MediaPipe 라이브러리를 확인했다. Windows 파일은 PE x64 EXE이며 공개 Release에 ZIP을 넣지 않았다.

APK/Linux tar에는 시험 이미지·세션 JSON·인증 JSON·PFX·키 저장소가 없으며 모델/라이선스와 실제 CLI voice worker는 포함한다. Linux tar의 docs/TOUCH.md를 확인하고 새 디렉터리에 추출한 공개 ELF를 PATH=/nonexistent로 실행했다. 터치 역량 true, 제스처 OFF, gestures on 거부, 0700 상태 디렉터리/0600 소유자 소켓, SIGTERM 정상 종료와 소켓 정리를 확인했다. 실제 Codex 계정 음성 통화를 새로 수행한 것으로 표시하지 않는다.

다운로드와 검증 JSON은 `/tmp/flownote-remote-061-public-1793177917104`에 있다. /tmp/flownote-verify-061.py와 /tmp/flownote-release-cli-smoke.py를 사용했다.

## 배포 범위

GitHub 네이티브 앱 시험 릴리즈다. Vercel/Railway/Docker 실행 target이 없으므로 클라우드 배포는 생략했다. 이후 앱 관리 세션 인계 규칙은 docs/operations/app-release-handoff.md에서 별도 제품 flownote-remote를 자동 편입하지 않도록 한다. 기존 웹/API나 원 작업 트리의 다른 사용자 변경은 수정하거나 커밋하지 않았다. 로그/보고서 추가는 파일과 주요 내용을 검증하며 앱을 재빌드하거나 클라우드에 배포하지 않는다.
