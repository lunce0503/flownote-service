# 원격 PC 목록·QR 등록 릴리스

상태: 2026-10-15 Android 0.2.0 사전 릴리스 APK와 Host 0.3.0 설치기 공개 완료. 다운로드 무결성 검증·현재 서버 업데이트 완료.

## 구현

- Android 0.2.0: 최대 32대의 PC 이름·WSS 주소·기기 토큰·지문을 Keystore AES-GCM으로 암호화 저장한다. 목록의 추가·편집·삭제·선택 연결, PC별 세션 분리, 구형 단일 PC 설정/세션의 원자적 이전을 지원한다.
- QR: 실제 카메라 스캔 후 주소·인증서 지문 확인을 요구한다. 영구 토큰을 QR에 넣지 않고 5분짜리 1회용 코드로 같은 Host의 TLS `/v1/pair`에서 신규 기기 토큰을 받는다. 수동·JSON 등록은 유지한다.
- Host 0.3.0: `remote-host pair --name "Work PC"`의 터미널 QR과 선택적 비공개 PNG, 사용자 전용 IPC, 만료·교체·재사용·동시 사용 거부. 기존 WSS v1, 등록 기기와 PTY 정책은 유지한다.
- 편집 화면은 입력 영역을 스크롤하고 저장·연결을 키보드 위에 고정한다. 이름·중복·용량을 먼저 검사해 로컬 입력 오류로 코드를 소모하지 않는다. HTTP 및 TLS 소켓 정리는 IO 스레드에서 수행한다.

## 검증

- 로컬 `npm run verify --prefix apps/host`: 타입 검사·Host 7개·빌드 성공.
- 로컬 `npm test --prefix apps/android/terminal`: 브리지·입력·ACK·출처 등 7개 성공.
- Host Linux/Windows: [main CI 38664391444](https://github.com/lunce0503/flownote-service/actions/runs/38664391444), [release CI 38664813996](https://github.com/lunce0503/flownote-service/actions/runs/38664813996) 성공. Windows 설치기 smoke 포함.
- Android [main CI 38666246146](https://github.com/lunce0503/flownote-service/actions/runs/38666246146) 성공: JVM 13개, lint/build, 에뮬레이터 통합 1개(기존 터미널·Keystore 이전·다중 PC·실제 카메라·TLS 등록·신규 토큰의 PTY 출력·코드 재사용 거부) 통과. 이후 앱을 강제 종료·재시작하고 두 PC의 목록 복원을 확인했다. lint는 오류 0·경고 23으로, 경고 없는 빌드라고 표시하지 않는다.
- CI는 2개의 실제 Host를 사용하고, 발급 PNG를 에뮬레이터의 virtual scene에 넣어 실제 scanner Activity로 읽는다. 파서나 가짜 결과로 카메라 수용 시험을 대체하지 않는다. gRPC 조준 보조는 CI 루프백 전용이며 배포 Host와 APK에는 포함하지 않는다.
- 보안/API 계약 검토: QR/요청/응답 필드와 제한, TLS 지문·호스트명·유효 기간, 명시적 신뢰 확인, 코드 소모 전 로컬 검사, 토큰의 암호화·해시 보관과 비밀값 비기록, OS별 QR 파일 접근 제한을 확인했다. SQL/DB와 Flownote API 계약 변경은 없다.
- 실패와 수정은 [버그 기록](../bugs/2026-10-15-remote-pc-qr-regression.md)에 남겼다. QR 초안의 다른 편집 화면 재사용, IME에 가려지는 저장 버튼, Main 스레드 TLS 정리, AGP의 테스트 종료 후 앱 삭제 경로를 구분했다. 마지막 항목은 시험 호출의 APK 유지 옵션으로 실제 앱 데이터의 강제 종료·재시작을 검사한다.

## 게시 및 서버

- [Host 0.3.0](https://github.com/lunce0503/flownote-service/releases/tag/remote-host-v0.3.0): 태그 소스 `8ad899d28856fc0032238ccb1ee6f26a5e978906`. Linux/Windows 설치기·tar.gz·SHA256 파일이 공개됐다. 다운로드한 설치기를 저장소와 대조하고 아카이브 무결성을 확인했다.
- Host tar.gz SHA-256: `82e436720a560fcdbffb2b8984ecc3508000bd650fe80f2ddc23b5e10095b69d`.
- 현재 서버의 사용자 서비스는 세션이 없는 상태에서 0.3.0으로 업데이트했다. 기존 인증서와 기기 토큰을 보존했고 기존 토큰의 실제 TLS/PTY/Codex 0.162.1 실행 및 세션 정리를 검증했다. 잘못된 토큰은 거부됐다. 비밀값은 문서에 저장하지 않는다.
- [Android 0.2.0](https://github.com/lunce0503/flownote-service/releases/tag/remote-android-v0.2.0): 태그 소스 `294cfbc79105b9c3d417a7bf43c7528577737930`. [릴리스 CI 38666777368](https://github.com/lunce0503/flownote-service/actions/runs/38666777368)의 verify/release 성공. 동일 소스 재검증, APK Signature Scheme v2, 서명 APK 새 설치와 등록 화면 실행, 게시까지 통과했다. Host와 Android의 태그 commit은 다르지만 두 태그의 `apps/host/` diff가 없음을 확인했다.
- [APK 다운로드](https://github.com/lunce0503/flownote-service/releases/download/remote-android-v0.2.0/flownote-remote-v0.2.0.apk): 43,578,899 bytes. 공개 파일을 다운로드해 `sha256sum -c SHA256SUMS.txt` 성공. APK SHA-256: `6ecd46c772f70071d28e76a77312c943a60fe0cb572b8c303deab8afbca0b8da`.
- 서명 인증서 SHA-256: `6ca2b19865f403970e31304c65d11c2a00d4adb89143d39f698441cb84c88126`. 0.1.0과 일치하므로 기존 앱 위 업데이트를 지원한다. 실제 공개 APK의 `jar tf`와 CI 검사에서 시험용 host JSON·pairing JSON/PNG가 없음을 확인했다. Keystore와 비밀번호는 출력·변경하지 않았다.

## 사용

기존 앱 위에 APK를 설치하면 이전 PC를 목록으로 이전한다. `+`로 수동/JSON PC 추가, 각 행의 편집·삭제 아이콘과 행 터치로 PC를 관리·연결한다. QR은 Host 0.3.0 이상에서 다음 명령으로 생성한 뒤 앱의 QR 아이콘으로 스캔하고 지문을 대조한다.

```bash
remote-host pair --name "Flownote PC"
```

다른 PC에는 Host 0.3.0 설치기를 적용한다. 같은 LAN 또는 기존 VPN이 필요하며 서버 포트를 인터넷에 직접 공개하지 않는다. QR이 만료됐으면 새로 생성한다.

## 배포 경계 및 후속 확인

독립 Android/PC Host 제품의 실행 산출물은 GitHub Releases로 배포한다. Flownote 웹·Expo API 목적지, Railway 서비스, DB, Vercel 실행 산출물을 바꾸지 않아 해당 클라우드 배포는 수행하지 않는다. 보고서 전용 후속 수정도 Docker/클라우드 배포 대상이 아니다. Flownote 로컬 앱 서버나 Compose는 실행하지 않았다.

실제 휴대폰의 새 APK 카메라·한글 IME, Android-to-Windows 사용, Codex 대화형 동작과 30분 안정성은 사용자 확인 대상이다. 이전 버전의 실제 접속 확인을 새 기능 전체 실기기 수용으로 확대하지 않는다. [확인표](../../apps/android/ACCEPTANCE.md)에 항목을 추가했다. 저장 목록은 여러 대를 지원하지만 활성 터미널 화면은 한 번에 하나다.

실행 계획은 [completed](../../docs/exec-plan/completed/2026-10-15-remote-pc-list-qr.md)로 이동했다. 문서의 로컬 링크와 `git diff --check`를 검증했다. 관련 없는 사용자의 변경은 커밋하거나 되돌리지 않는다.
