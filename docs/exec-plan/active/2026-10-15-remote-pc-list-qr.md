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
- [x] Host 1회용 페어링 및 QR 생성/자동 테스트. `npm run verify --prefix apps/host` 6개 통과.
- [x] Android 다중 PC 저장과 기존 데이터 이전/자동 테스트 구현. 실행 결과는 Android CI에서 확인한다.
- [x] PC 목록/편집/QR 카메라·지문 확인/페어링 연결 흐름 구현.
- [ ] Android 기기 시험: 다중 PC 추가·재실행·전환·삭제와 QR 등록·만료·재사용·위조 거부.
- [ ] 기존 Linux/Windows Host 및 Android 터미널 회귀 검증.
- [ ] 같은 소스의 서명 APK와 Host 설치기 GitHub 릴리즈, 다운로드 무결성 확인, 기록.

## 검증과 배포

Host는 `npm run verify --prefix apps/host`, Android 터미널은 `npm test --prefix apps/android/terminal`, SDK/에뮬레이터는 GitHub Actions `Remote Android`를 사용한다. 필요 시 CI 화면 캡처를 확인한다. 릴리즈는 검증 성공한 commit에 태그를 붙여 기존 GitHub Actions로 서명·게시한다. 이 제품은 직접 PC WSS 통신으로 Railway/Vercel 실행 산출물이 바뀌지 않는다.

기존 사용자 설정과 다른 작업의 변경은 수정·커밋하지 않는다. 테스트에 실제 등록 토큰/개인키를 사용하거나 QR 데이터를 로그·문서에 넣지 않는다. 현재 서버 서비스의 사용자 세션을 임의로 중단하지 않는다.
