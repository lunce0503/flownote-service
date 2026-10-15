# Flownote Remote 모바일 IDE

상태: 소스 `1d5d6f99a99cc87c833fd9b036a7920c976811bf`의 전체 검증·Host 0.4.0 공개/서버 업데이트·Android 0.3.0 서명 사전 릴리스 공개·다운로드 무결성 확인 완료.

## 구현과 경계

- Android 0.3.0 / Host 0.4.0. 기존 앱의 코드 탭에 파일 탐색·폴더 이름 필터·최대 8개 파일 탭을 추가했다. CodeMirror 6을 APK에 포함해 구문 강조·줄 번호·접기·들여쓰기·찾기/바꾸기·줄 이동·undo/redo·자동 줄바꿈·복사·저장을 제공한다. 외부 CDN이나 편집 서버를 실행하지 않는다.
- 휴대폰은 목록/코드를 전환하고 720dp 이상에서는 나란히 표시한다. 키보드가 열린 좁은 화면은 헤더를 접는다. 도구는 아이콘·접근성 이름·툴팁을 제공한다. 터미널/코드 모드 전환 시 WebView를 유지하고 숨겨진 뷰의 입력/접근성을 제외한다.
- 미저장 탭 닫기·파일 다시 읽기·PC 떠나기에 버리기 확인을 요구한다. 저장은 JS의 최신 snapshot을 받고 읽은 revision을 보낸다. PC에서 변경됐으면 409로 거부하고 초안을 유지한다. 저장 도중 후속 입력은 dirty로 남긴다. 저장 실패/불명확한 응답은 자동 재전송하지 않는다.
- 파일 루트는 Host cwd(초기화 시 미지정이면 사용자 홈)를 유지한다. 상대 경로, 기존 일반 UTF-8 파일 256 KiB, 폴더 페이지 200개/스캔 5000개 한도를 적용한다. 경로 이탈·symlink/junction·hard link·바이너리·일반 비밀 파일(.env/셸 설정·히스토리/인증 키 등)을 거부한다. 임시 파일 sync/원자 rename, Linux mode·Windows private ACL을 유지한다.
- 인증·TLS pin/호스트명·토큰 저장·QR·WSS v1 정책을 유지한다. 편집기 JS에는 인증 정보를 전달하지 않는다. HTML/JS 파일은 텍스트로만 표시한다. 다른 PC의 epoch에는 초안/undo를 넘기지 않는다.
- 이번 기능은 프로젝트 코드 보기/편집이며 LSP·디버거·파일 생성/삭제·프로세스 종료 후 초안 디스크 복원은 포함하지 않는다. 기존 전체 원격 셸을 OS sandbox로 제한하는 기능도 아니다. 다른 OS 프로세스와 완전 원자적 파일 CAS는 보장하지 않는다.

## 검증 증거

- 로컬 `npm run verify --prefix apps/host`: 타입/Host 10개/빌드 성공. `npm test --prefix apps/android/terminal`: 터미널 브리지·회전 viewport 8개 성공.
- 실제 CodeMirror 브라우저: 한글 입력·CRLF·undo/redo·탭 이력·검색/바꾸기·원본 HTML 비실행·외부 출처/다른 PC 격리·Android native 빈 출처·과대 편집 거부. 390x844, 844x390, 800x1280, 1280x800 화면 검증.
- JVM 15개: 기존 13개와 파일 API TLS/Bearer/충돌/잘못된 pin, 저장 snapshot 이후 후속 입력 보존 2개.
- Host CI [38692950730](https://github.com/lunce0503/flownote-service/actions/runs/38692950730), [38693516513](https://github.com/lunce0503/flownote-service/actions/runs/38693516513): Linux/Windows 10개·Windows 설치기 성공. private ACL 동일성과 junction 거부 포함. 최종 소스는 최신 실행으로 재확인한다.
- Android [38693251202](https://github.com/lunce0503/flownote-service/actions/runs/38693251202): 실제 Host 파일 탐색·WebView 입력·snapshot 저장·충돌 후 초안 유지·버리기 확인, PTY/session 유지·세로/가로·태블릿 폭 분할, 기존 터미널/PC 목록/실제 QR 카메라 및 앱 재실행 검증 통과.
- Android [38693998007](https://github.com/lunce0503/flownote-service/actions/runs/38693998007)와 Host [38693998016](https://github.com/lunce0503/flownote-service/actions/runs/38693998016): 파일 필터·미저장 다시 읽기/PC 떠나기 취소·PC 변경 재불러오기·셸 설정 보호를 포함한 검사 성공.
- 커서 좌표/회전 following/CRLF 실제 저장 bytes 한도 보완 후 최종 Android [38708129934](https://github.com/lunce0503/flownote-service/actions/runs/38708129934) 성공. 빌드·브리지 8개·브라우저·JVM 15개·실제 Android 통합 1개와 앱 프로세스 재시작 후 PC 목록 유지가 통과했다. lint는 오류 0·경고 28개이며 경고 없는 빌드로 표시하지 않는다.
- 실패 원인과 조치는 [버그 기록](../bugs/2026-10-15-remote-mobile-ide.md)에 남겼다. 로컬 브라우저 라이브러리 부재는 임시 추출 경로로 해결했고 OS 설정/Flownote 앱 서버를 변경하지 않았다. Windows PSModulePath와 Android native 메시지 source origin의 실제 차이를 시험에서 찾아 수정했다.

## 배포

- [Host 0.4.0](https://github.com/lunce0503/flownote-service/releases/tag/remote-host-v0.4.0): [릴리스 CI 38708807671](https://github.com/lunce0503/flownote-service/actions/runs/38708807671)에서 Linux/Windows 10개·설치기·패키징/게시 성공. 실제 다운로드 SHA-256 검증과 저장소 설치기 대조 성공. tar.gz SHA-256: `b829bce0f14a0ea996db995adc588fee74969c76c4fb777fe7d7ae4047cf9e11`.
- 현재 서버는 활성 PTY가 없는 것을 재확인한 뒤 설치기와 사용자 서비스 restart로 0.4.0에 업데이트했다. 기존 config bytes와 공개 인증서가 그대로임을 비교했다. 재초기화하지 않았으며 cwd는 `/home/kwon`을 유지했다. Node.js 25.9.0, doctor 모두 성공, 서비스 active.
- 기존 기기 토큰과 인증서 검증으로 홈/Flownote 프로젝트 목록 조회 200, `.bashrc` 직접 읽기 거부 403을 확인했다. 사용자 파일은 쓰지 않았다. 실제 PTY·기존 토큰·잘못된 토큰 401·Codex 0.162.1 실행·세션 종료 확인, FACTCHAT 환경 변수는 값 출력 없이 존재만 확인했고 유료 API 호출은 하지 않았다.
- Host 롤백용 0.3.0 설치와 기존 설정은 유지한다. [Android 0.3.0](https://github.com/lunce0503/flownote-service/releases/tag/remote-android-v0.3.0)은 [릴리스 CI 38708807101](https://github.com/lunce0503/flownote-service/actions/runs/38708807101)의 같은 소스 재검증·서명 APK 빌드·새 설치/실행·게시까지 성공했다. Host/Android 두 태그는 모두 같은 소스다.
- [APK 다운로드](https://github.com/lunce0503/flownote-service/releases/download/remote-android-v0.3.0/flownote-remote-v0.3.0.apk): 43,965,375 bytes. 공개 파일 다운로드의 `sha256sum -c SHA256SUMS.txt` 성공, 익명 HTTP 200 확인. APK SHA-256: `2741a092286b61ca24dd5eefba3428ff1c4898f932053493563934d34bc9d5e8`.
- APK Signature Scheme v2 검증 성공. 서명 인증서 SHA-256 `6ca2b19865f403970e31304c65d11c2a00d4adb89143d39f698441cb84c88126`으로 이전 0.1.0/0.2.0과 같아 덮어 업데이트를 지원한다. 공개 APK에서 편집기 HTML/JS·라이선스 33개를 확인했고 Host/QR 시험 JSON/PNG가 없음을 검사했다. Keystore/비밀번호를 출력하거나 변경하지 않았다.

이 작업은 독립 Android/PC 제품이다. Flownote 웹/Expo/Railway 서비스·DB·Vercel 실행 산출물을 바꾸지 않으므로 해당 배포는 수행하지 않는다. CI의 격리된 임시 프로젝트에서 쓰기 시험을 하고 사용자 실제 프로젝트/production DB를 시험 데이터로 사용하지 않는다. 관련 없는 사용자 변경은 배포·커밋하거나 되돌리지 않는다.

## 후속 확인

실제 휴대폰의 한글 IME·긴 편집 세션, Android-to-Windows 실사용은 사용자 확인 대상이다. 자동 에뮬레이터/브라우저 증거를 실제 휴대폰 검증으로 확대하지 않는다. [실기기 확인표](../../apps/android/ACCEPTANCE.md), [제품 사양](../../docs/product-specs/remote-android.md), [파일 API](../../protocol/remote-host/workspace.md)를 따른다. 앱 프로세스를 종료하기 전에 파일을 저장한다.

완료 감사: 파일 탐색·필터·다중 탭·코드 렌더링/검색·입력/undo·snapshot 저장·충돌/초안 보존·확인 취소·PC 변경 재불러오기·기존 PTY/PC 목록/QR 회귀·반응형 화면은 위 실제 엔진/Android/Host 검증으로 확인했다. 서명 APK/설치기는 같은 검증 소스로 공개했고 실제 다운로드와 현재 서버 상태를 확인했다. 실행 계획을 [completed](../../docs/exec-plan/completed/2026-10-15-remote-mobile-ide.md)로 이동했다. 문서 로컬 링크와 `git diff --check`를 확인했으며 문서 마감만으로 실행 산출물을 다시 빌드/배포하지 않는다.
