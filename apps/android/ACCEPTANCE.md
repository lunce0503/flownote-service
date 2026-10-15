# Remote Android 수용 시험

원본 기준: 사용자가 제공한 `android_desktop_cli_mvp_report.md`의 단계 A-G와 필수 수용 시험. 실제 기기 검증은 사용자가 APK를 설치해 수행하기로 했다. 자동 테스트 통과와 실기기 검증 완료를 혼동하지 않는다.

## 자동 검증 범위

| 항목 | 검증 위치 | 증거 범위 |
| --- | --- | --- |
| APK 빌드·타입·Android lint | `Remote Android` workflow | SDK 35, minSdk 29; 실기기 OS별 호환성은 별도 |
| 입력 크기·UTF-8·URL·지문 | `ProtocolTest.kt` | 한글/emoji 청크, 인증정보 없는 URL, 다른 인증서 거부 |
| 연결·입력 중복 방지 | `ConnectionTest.kt` | TLS WebSocket 테스트 서버, 마지막 처리 seq attach, 입력 재전송 없음 |
| 복구 불가·토큰 폐기·잘못된 응답 | `ConnectionTest.kt` | 상태 전환, 입력 차단, 명시적 새 세션 |
| 출력 ACK·초기화 순서·출처 | `terminal/test/bridge.test.mjs` | JS 브리지 단위 테스트; 실제 렌더링은 기기 시험 |
| PC 등록·암호화 저장 | `RemoteAppTest.kt` | Android 에뮬레이터와 실제 Linux Host, 평문 토큰 저장 여부 |
| PC 목록·구형 설정 이전 | `ProfileCatalogTest.kt`, `RemoteAppTest.kt` | 실제 Keystore 구형 암호문 이전, 추가·선택·편집·삭제, 두 Host의 자격 증명/세션 분리 |
| 목록의 프로세스 재실행 복원 | `scripts/run-device-tests.sh` | 기기 시험 뒤 앱 강제 종료·재시작, 저장된 두 PC의 목록 표시 |
| QR 카메라·등록 연결 | `RemoteAppTest.kt` | 가상 장면 PNG를 실제 카메라로 스캔, 지문 확인 전 저장 없음, TLS 등록·신규 토큰·실제 PTY 출력·QR 재사용 거부 |
| QR 계약·인증 거부 | `PairingTest.kt`, Host pairing 시험 | 만료·잘못된 URL/버전/지문, 잘못된 이름의 코드 소모 방지, 코드 교체·동시 사용·재사용 거부 |
| 인증 실패·잘못된 지문 | `RemoteAppTest.kt` | 잘못된 자격 증명으로 WSS 연결 불가 |
| 셸·ANSI·한글 문자열·도구줄 | `RemoteAppTest.kt` | 실제 PTY 출력, Compose 입력, Tab/방향키/Ctrl+C, 붙여넣기 취소 |
| 10회 단절·복귀 | `RemoteAppTest.kt` | 같은 PTY sessionId 유지; LAN 무선 품질·30분 부하는 별도 |
| 백그라운드·회전·화면 손실 | `RemoteAppTest.kt` | Activity 생명주기, 새 WebView에서 복구 안내, 새 세션 |
| 명시적 종료 | `RemoteAppTest.kt` | 세션 종료 응답과 저장된 sessionId 제거 |
| Windows Host 설치·연결 | `Remote Host` workflow | Windows PTY/WSS/IPC/설치기; Android-to-Windows 실사용은 별도 |
| 모바일 IDE 코드 엔진 | `terminal/test-editor-browser.mjs` | 실제 CodeMirror 입력·한글·CRLF·탭 undo·찾기/바꾸기·PC epoch/출처 격리, 4개 뷰포트 |
| 모바일 IDE 통합 | `RemoteAppTest.kt` | 실제 Host 목록·파일·Android WebView 입력·snapshot 저장·PC 변경 충돌/초안 유지·버리기 확인·터미널/PTy 유지, 세로/가로/태블릿 크기 |
| 파일 API/권한 | Host `workspace.test.ts`, JVM `WorkspaceTest.kt` | 인증/폐기/경로·링크·binary·한도·CAS/동시 저장·UTF-8·Linux mode/Windows ACL·TLS pin·저장 중 후속 입력 |

CI 실행 링크와 실제 통과 결과는 `logs/report/` 릴리스 보고서에 기록한다. 표에 테스트가 있다는 사실만으로 통과를 주장하지 않는다.

## 실기기 확인표

준비: Android 10 이상, 최신 Android System WebView, PC의 Remote Host, 같은 LAN 또는 기존 VPN. PC의 Node.js와 Codex 설치·인증은 앱과 별개다. 공용 인터넷에 Host 포트를 열지 않는다. 시험 결과에 토큰, 등록 JSON, 터미널의 민감한 내용을 붙이지 않는다.

1. APK를 새로 설치하고 PC 이름·WSS 주소·토큰·지문을 등록한다. PC 지문과 대조 후 Linux 셸 프롬프트가 표시되는지 확인한다.
2. 지문 한 글자 또는 토큰을 바꾸면 연결이 차단되고, 자동으로 신뢰하지 않는지 확인한다. 이후 올바른 값으로 복구한다.
3. `pwd`, `git status`, `printf '\033[32mGREEN\033[0m\n'`을 실행한다. 표시·ANSI 색상·연속 출력·선택·스크롤을 확인한다.
4. 평소 쓰는 한글 IME로 영문·한글·혼합 명령을 입력한다. 조합 중 문자가 중복 전송되지 않는지 확인한다. 직접 터미널 입력과 명령 입력창을 각각 시험한다.
5. Tab 완성, 방향키 히스토리, 실행 중 Ctrl+C, 여러 줄 붙여넣기 취소·승인을 확인한다. 스크롤·선택만으로 입력이 전송되면 실패다.
6. 키보드 열기·닫기, 세로·가로 회전 후 `stty size`로 PTY 크기가 바뀌는지 확인한다. 도구줄이나 명령 입력창이 키보드에 가려지면 실패다.
7. 앱을 백그라운드로 보내고 5분 이내 돌아온다. Wi-Fi 단절도 10회 반복한다. `remote-host status`의 sessionId가 유지되고 명령이 중복 실행되지 않아야 한다.
8. 앱을 강제 종료 후 다시 연다. 완전 복구처럼 표시하지 않고 새 세션 선택이 제공되어야 한다. 새 세션에서 명령을 실행한다.
9. PC에서 많은 출력을 생성하며 연결을 끊어 1MiB 재생 범위를 넘긴다. 복구 불가 안내 후 새 세션이 정상 동작해야 한다.
10. 앱에서 세션 종료, 5분 초과 단절, Host 종료를 각각 시험한다. `remote-host status`와 PC 프로세스 목록으로 세션·일반 자식 프로세스 정리를 확인한다. 의도적으로 분리 실행한 daemon은 별도다.
11. 다른 클라이언트로 접속해 기존 연결을 탈취할 수 없는지 확인한다. `remote-host revoke --device phone-01` 후 현재 연결이 끊기고 재접속도 거부되어야 한다. 폐기 시험은 마지막에 수행한다.
12. PC에 설치·인증된 Codex를 실행한다. 실제 사용 버전과 입력·스크롤·resize·중단 결과를 기록한다. 모델 사용료는 PC의 인증 환경을 따른다.
13. LAN에서 30분 사용하고 10회 이상 단절·복귀한다. 시작·종료 시 Host의 세션 수와 RSS, Android 메모리를 비교한다. 세션이나 메모리가 지속 증가하면 실패다.
14. 기존 앱 위에 업데이트해 이전 PC 설정을 유지하는지 확인한다. 두 번째 PC를 추가하고 목록에서 전환·이름 편집·삭제한 뒤 첫 PC의 설정이 유지되는지 확인한다. 앱 강제 종료 뒤에도 목록이 남아야 한다.
15. Host 0.3.0 이상에서 `remote-host pair --name "Work PC"`를 실행하고 앱의 QR 아이콘으로 스캔한다. PC의 지문을 대조·확인한 뒤 연결한다. 카메라 취소·권한 거부가 목록을 바꾸지 않는지, 사용한 코드와 5분 지난 코드가 거부되는지도 확인한다. 새 QR은 이전 미사용 QR을 대체한다.
16. Host 0.4.0 이상으로 업데이트하고 코드 탭에서 프로젝트를 탐색한다. 휴대폰 IME의 한글 입력·선택·찾기/바꾸기·undo/redo·줄 이동을 확인한다. 여러 파일 초안을 유지하며 터미널과 전환한 뒤 저장하고 PC 내용과 비교한다. PC에서도 같은 파일을 수정하면 앱 저장이 거부되고 초안이 남아야 한다. 닫기/불러오기/PC 떠나기 확인에서 취소하면 변경이 남아야 한다. 작은 화면·가로 키보드·태블릿 분할 화면의 글자/버튼 겹침이 없어야 한다. 프로세스 강제 종료 전 저장한다(초안 디스크 복원 미지원).

기록 형식: APK 버전 / Android·기기·IME / PC OS·Host·Codex 버전 / 항목별 통과·실패 / 오류 문구(비밀값 제거). 현재 실기기 결과는 대기 중이며, 이 확인표 완료 전에는 원본 보고서의 MVP 전체 수용 시험을 통과했다고 표시하지 않는다.
