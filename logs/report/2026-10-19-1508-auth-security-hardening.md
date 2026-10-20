# 인증 보안 보고서 후속 보완

## 요청과 기준

사용자가 첨부한 `2026-10-18-1645-auth-security-review.md`의 F-01~F-06을 현재 코드와 대조해 보완했다. 첨부 파일은 발견 사항의 근거로 읽었으며 별도의 운영 명령이나 권한 위임으로 취급하지 않았다. 원문 비밀값·사용자 계정·DB 원본을 수집하지 않았다.

## 변경

| 항목 | 보완 |
| --- | --- |
| F-01 서버 로그아웃 | 현재/전체 기기 세션 폐기 API, legacy Redis 항목 삭제, 서버 성공 후 웹 상태 정리 |
| F-02 로그인 제한 | Redis 원자 카운터: 계정 10회/분·100회/시간, 전송 peer 60회/분. 429·Retry-After, Redis 장애 시 신규 로그인 503. 미등록 계정도 동일 오류와 BCrypt dummy 검증 |
| F-03 비밀번호 | 필수값, 최소 15자, UTF-8 최대 72바이트, 공백/반복/기본 흔한 암호 거부. 프런트 길이 정책 일치, 기존 BCrypt 로그인 유지 |
| F-04 브라우저 토큰 | Vercel 동일 출처 프록시, Secure/HttpOnly/SameSite=Strict 쿠키, 허용 Origin+custom header 검증, JSON·localStorage 토큰 제거. 네이티브 Bearer 유지 |
| F-05 보안 헤더 | 프레임·object·base-uri CSP 강제, 나머지 출처 CSP Report-Only, X-Frame-Options·nosniff·Referrer-Policy |
| F-06 만료·폐기 정합성 | 세 서비스 양성 인증 캐시 제거. 매 요청 DB의 현재 만료와 역할 확인. Redis 장애·동시 캐시 재생성으로 세션을 복원하지 않음 |

웹 Socket.IO는 HttpOnly 쿠키를 전달하는 동일 출처 polling을 사용한다. 캔버스 미리보기 입력도 세션을 재검증하며 주식 SSE의 브라우저 토큰 query 전달을 제거했다. 데스크톱 설치 검증도 브라우저 저장소에서 토큰을 읽지 않는다.

## 검증

- Spring `./gradlew test --no-daemon --console=plain`: 16개 통과. 격리 배포 소스에서도 통과.
- Gateway `uv run pytest -q`: 28개 통과.
- Canvas·Serve `go test -p 1 ./...`: 모두 통과. 역할 강등과 세션 폐기를 요청마다 확인하는 회귀 시험 추가.
- 웹 `yarn build`: 타입 검사·Vite 빌드 통과. 기존 운영 피드백 기능을 보존한 배포 소스에서도 통과.
- 변경한 프런트 파일 ESLint와 웹 전체 `yarn lint`: 통과.
- cloud config, 배포/데스크톱 smoke JS 구문과 diff whitespace 확인 통과.
- 첫 Go 병렬 빌드는 디스크 부족으로 중단돼 순차 실행으로 통과했다. 검증용 임시 Go 도구를 정리했으며 사용자 데이터·기존 생성물은 삭제하지 않았다.
- Spring Retry-After의 읽기 전용 헤더 수정 오류를 단위 테스트가 검출해 전용 응답 예외로 수정했다.
- 첫 staging gate는 쿠키 인증·CSRF·세 서비스 로그아웃·로그인 제한 429와 61초 후 복구 시험을 통과했다. 캔버스 연결은 Vercel의 끝 슬래시 경로 404를 검출했다. 두 Socket.IO 클라이언트의 자동 슬래시 추가를 끄고 새 웹 배포 후 전체 gate를 재실행했다. 실패한 소스는 production에 배포하지 않았다.
- 다음 실행은 31/32개 통과했으며 첫 Android 로그인 화면의 입력란 표시 시간 초과 한 건이 발생했다. 독립된 새 브라우저에서는 같은 배포의 입력란 표시가 정상이었다. 원인은 확정하지 않았으며 실패 기록을 유지한다. 같은 Ready 배포물·현재 별칭 일치를 확인한 후 전체 32개가 통과했다. assertion·timeout·retries=0 조건을 완화하지 않았다.
- 운영 추가 점검에서 `/`에 로그인 입력란이 있어야 한다는 잘못된 기대값으로 시간 초과가 발생했다. DOM 확인 결과 정상 홈 화면이었다. 홈 제목, `/login` 입력란, `/canvas`의 비인증 로그인 리다이렉트를 구분한 점검으로 정정했고 desktop·Android 모두 통과했다. 이 점검 오류를 앞선 staging 시간 초과의 원인으로 단정하지 않는다.

## 배포 소스

기준 HEAD는 `21d2d9441c5338cbd2c9cd7394fd580715b1faaf`다. 운영 기록을 통해 10월 18일 배포된 PDF 읽기·관성 이동·설정·플래너 제안 기능이 미커밋 작업 트리에 남아 있음을 확인했다. 이 기존 운영 기능과 테스트를 배포 snapshot에 보존한 뒤 보안 변경을 적용했다. 별도 MVP 안정화 후보는 채택하거나 배포하지 않았다.

배포 체크아웃은 `/tmp/flownote-auth-security-release`이며 기존 작업 트리 변경을 되돌리지 않았다. 격리 소스의 Railway 상태 조회는 연결된 관리 저장소에서 실행하도록 배포 도구를 수정했다. 첫 배포의 관찰 중단 후 정확한 deployment ID를 재사용했으며 중복 업로드하지 않았다.

## 배포 결과

staging 전체 32개 시험이 retries=0으로 통과했다(2026-10-19 15:23:31 KST). 실패를 skip하거나 assertion·timeout을 완화하지 않았다. 같은 소스의 production 승격과 배포 스크립트의 smoke가 완료됐다(2026-10-19 15:31:49 KST). 운영 계정 생성·로그인·데이터 쓰기는 하지 않았으며 운영 검증은 read-only로 제한했다.

- 소스 지문: `cb67109feb6ee47b888f4ef1171463b5cf22c8e5fbfdcebf3a26f9bac854598e`
- staging main: `f3878ee5-89c6-4a7d-a0d5-b65d7e4efd14`, SUCCESS
- staging canvas: `0671e448-d78b-4ac4-bce2-b1d7ca96cda5`, SUCCESS
- staging serve: `725ade78-ab17-4237-8115-d88d73999fbe`, SUCCESS
- staging api: `a3ca1683-0908-48eb-a711-242d645d3134`, SUCCESS
- staging web: `dpl_8uaQQV8xj8udErshXvw9icQHRcRt`, READY, <https://flownote-react-staging-3fhdrdbwu-flownote-service.vercel.app>
- production main: `765de35c-74b6-414a-a28f-c63df969f9e6`, SUCCESS
- production canvas: `1db6b242-398f-41f5-b6b8-ca553a4bf678`, SUCCESS
- production serve: `3293f899-855b-4169-94cf-578e11fb124c`, SUCCESS
- production api: `1cf2b63e-24a5-4784-bf10-a0e4ad8304d2`, SUCCESS
- production web: `dpl_Dnj6nEKPWXsJdHj6m9HrFyuwjthL`, READY, <https://flownote-react-44mfemkih-flownote-service.vercel.app>
- 운영 URL: <https://flownote-react.vercel.app>. `/`, `/login`, `/canvas` 응답 200 및 CSP·DENY·nosniff·Referrer-Policy 확인. `/web-api/api/users/me` 비인증 401 확인.
- 운영 새 desktop·Android 브라우저에서 홈·로그인 입력란·보호 경로 로그인 전환 통과, pageerror 없음.
- 두 환경의 receipt 지문이 일치한다. 관리 저장소 `.release/auth-security-20261019-staging-all.json`, `.release/auth-security-20261019-production-all.json`에 배포 결과를 보존했다.
- 배포 snapshot과 현재 작업 폴더의 관련 코드·테스트·설정 58개를 최종 대조해 내용 일치를 확인했다.

## 정책과 남은 범위

- 양성 인증 캐시를 없앤 대신 인증마다 PostgreSQL 조회가 발생한다. 캐시를 다시 도입하려면 폐기·권한 변경·장애 시 일관성을 별도로 설계해야 한다.
- 로그인 peer 제한은 헤더를 신뢰하지 않는 보수적 제한이다. 프록시 뒤 여러 사용자가 공유할 수 있으므로 트래픽 증가 시 신뢰할 수 있는 edge IP/WAF 정책을 따로 검증해야 한다.
- 기본 흔한 암호 목록은 전체 유출 암호 데이터베이스가 아니다. MFA·계정 복구·비밀번호 변경 기능을 새로 구현하지 않았다.
- 전체 script/img/font CSP는 호환성 관찰 단계다. 프레임 삽입 방지는 강제 적용한다.
- 폐기 전에 시작된 요청은 완료될 수 있다. 기존 `/sync` 수신 연결은 최대 60초 주기의 재검증을 유지하며 발행·새 보호 요청은 DB로 확인한다.
- 기존 웹 사용자는 재로그인해야 한다. production 계정의 일괄 강제 폐기나 비밀번호 변경은 수행하지 않았다.

## 롤백 기준

작업 전 production 성공 배포: main `48da51f2-9ac4-4159-8cb5-7413bcd67e8b`, canvas `6f2d786f-3b16-47d6-857b-cbdc79c1671e`, serve `5f50033e-fd2b-450c-a122-b01c769743e7`, api `6e5ef6f4-854e-461f-9332-43324c78d099`. 웹은 이전 피드백 배포 `dpl_4655MEcEN1fCQUCoryq6YbDwzJtw`를 기록 기준으로 둔다. DB schema 변경은 없다. 이전 인증 캐시 코드로 롤백하면 폐기 정합성 위험이 되돌아오므로 웹·gateway 호환성과 함께 판단한다.
