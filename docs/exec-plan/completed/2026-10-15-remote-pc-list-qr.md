# Remote PC 목록과 QR 등록

## 목표

Android 앱에 여러 PC의 이름/주소/토큰/지문을 암호화 저장하고 목록에서 추가·수정·삭제·선택 연결한다. 기존 단일 PC 설정은 유실 없이 이전한다. PC별 세션 ID를 분리하고 서로 다른 PC에 입력/재접속이 섞이지 않도록 한다.

Host가 생성하는 5분 유효·1회용 QR 등록 코드를 앱 카메라로 읽고, 주소·지문 확인 후 TLS로 기기 토큰을 발급받아 목록에 저장한다. 수동/JSON 등록도 유지한다. 등록 QR에 영구 기기 토큰을 넣지 않는다.

## 범위와 계약

- Android: ProfileStore/RemoteViewModel/PC 목록·등록 화면/QR scanner/페어링 클라이언트 및 회귀 시험.
- Host: local IPC `pair`, HTTPS `POST /v1/pair`, CLI `pair`의 QR 표시/PNG 파일, 만료·일회성·입력 제한 시험.
- 기존 WSS v1 터미널 계약은 유지하고 등록 계약을 `protocol/remote-host/`에 추가한다.
- PC 목록은 여러 설정을 저장한다. 한 번에 활성 터미널 화면은 하나이며 PC 전환 시 기존 연결은 해제한다.
- QR를 읽기만 해서는 접속/신뢰하지 않는다. 명시적 지문 확인 후 페어링한다. 카메라 권한 거절/취소는 저장 정보를 바꾸지 않는다.

## 단계

- [x] 현행 저장소/CLI/배포 구조 확인, 보안·API 계약 검토 기준 확인.
- [x] Host 1회용 페어링 및 QR 생성/자동 테스트. `npm run verify --prefix apps/host` 7개 통과.
- [x] Android 다중 PC 저장과 기존 데이터 이전/자동 테스트 구현. JVM 13개 통과, Android 실제 Keystore의 구형 암호문 이전 및 두 Host의 PC 전환 구간 확인.
- [x] PC 목록/편집/QR 카메라·지문 확인/페어링 연결 흐름 구현.
- [x] Android 에뮬레이터 기기 시험: 다중 PC 추가·재실행·전환·삭제와 QR 등록·재사용 거부. 만료·위조 거부는 Host/JVM에서 별도 검증. 실기기 확인과 구분한다.
- [x] Linux/Windows Host 7개 검증과 Windows 설치기 검증. Android 카메라→TLS 등록→PTY 및 프로세스 재시작 후 목록 복원도 통과.
- [x] 각 검증 소스의 서명 APK와 Host 설치기 GitHub 릴리즈, 다운로드 무결성 확인, 기록.

## 검증과 배포

Host는 `npm run verify --prefix apps/host`, Android 터미널은 `npm test --prefix apps/android/terminal`, SDK/에뮬레이터는 GitHub Actions `Remote Android`를 사용한다. 필요 시 CI 화면 캡처를 확인한다. 릴리즈는 검증 성공한 commit에 태그를 붙여 기존 GitHub Actions로 서명·게시한다. 이 제품은 직접 PC WSS 통신으로 Railway/Vercel 실행 산출물이 바뀌지 않는다.

기존 사용자 설정과 다른 작업의 변경은 수정·커밋하지 않는다. 테스트에 실제 등록 토큰/개인키를 사용하거나 QR 데이터를 로그·문서에 넣지 않는다. 현재 서버 서비스의 사용자 세션을 임의로 중단하지 않는다.

## 검증 진행 기록

- Linux/Windows Host 최신 소스 검증: GitHub Actions `38664391444` 성공. 로컬 `npm run verify --prefix apps/host` 7개 통과.
- Android JVM 13개와 에뮬레이터 통합 1개 통과. 기존 Keystore 이전, PC 추가·선택·편집·삭제/세션 분리, 실제 카메라 QR 등록→신규 토큰→PTY 출력/코드 재사용 거부와 프로세스 강제 종료·재시작 후 두 PC의 목록 복원을 확인했다. CI `38666246146` 성공.
- 실제 scanner Activity를 사용한다. CI 가상 장면의 가구가 QR을 가렸던 증거에 따라 pre-launch 단계에서 포스터 위치를 조정한다. 문자열/가짜 Activity 결과로 카메라 검증을 대체하지 않는다.
- `apps/android/scripts/`의 emulator gRPC 8554는 GitHub CI 루프백 전용 조준 보조다. 관련 npm 모듈은 Host devDependencies이고, 배포 Host에 gRPC 서비스를 추가하거나 APK에 보조 스크립트를 넣지 않는다.
- 실패 실행 및 조치: `logs/bugs/2026-10-15-remote-pc-qr-regression.md`. Android 태그 `remote-android-v0.2.0`은 통과 소스 `294cfbc79105b9c3d417a7bf43c7528577737930`에 발행했다. 릴리스 CI `38666777368`에서 같은 소스 재검증·서명·APK 새 설치·공개까지 성공했다. 공개 APK의 체크섬, 기존 0.1.0과 동일한 서명 지문, 시험 자산 부재를 확인했다.
- Host 0.3.0 태그 `8ad899d28856fc0032238ccb1ee6f26a5e978906`, 릴리스 CI `38664813996` 성공. 설치기·패키지 다운로드/체크섬을 검증하고 현재 서버를 업데이트했다. 기존 인증서·기기 토큰을 보존했으며 실제 PTY/Codex 0.162.1 smoke를 통과했다. 이후 수정은 Android/검증에만 있어 Host 실행 소스는 같다.

완료: [릴리스 보고서](../../../logs/report/2026-10-15-0135-remote-pc-list-qr-release.md). 새 APK의 실제 휴대폰 카메라/IME·Windows 접속·30분 안정성은 [실기기 확인표](../../../apps/android/ACCEPTANCE.md)로 후속 확인한다. 자동화 통과와 실기기 전체 수용을 혼동하지 않는다.
