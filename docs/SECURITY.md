# 보안

## 보안 모델

Flownote는 로그인 세션을 기반으로 사용자 데이터를 분리한다. 서버 API는 `Authorization` 헤더를 통해 사용자 ID를 확인하고, 사용자 소유 데이터는 `user_id` 조건으로 조회/수정/삭제해야 한다.

## 웹 인증과 세션 폐기

- 웹은 동일 출처 `/web-api/**` 프록시와 `__Host-flownote_session` 쿠키를 사용한다. 쿠키는 Secure·HttpOnly·SameSite=Strict·Path=/이며 브라우저 저장소와 로그인 JSON에 세션 토큰을 남기지 않는다. 기존 localStorage 토큰은 제거하고 재로그인을 요구한다.
- 상태 변경은 허용된 Origin과 `X-Flownote-Web: 1`을 함께 검증한다. 모바일 네이티브 Bearer 계약은 유지한다. 웹 Socket.IO는 동일 출처 프록시의 polling 전송을 사용한다.
- `POST /api/users/logout`은 현재 세션, `/logout-all`은 인증된 사용자의 모든 세션을 DB에서 폐기한다. 서버 응답 후 웹 상태를 정리하며 실패를 성공으로 표시하지 않는다.
- Spring·canvas·serve는 매 인증 요청에서 DB의 현재 만료와 역할을 확인한다. 기존 `session:{token}` 양성 Redis 캐시를 더 이상 읽거나 만들지 않는다. 진행 중인 요청은 완료될 수 있지만 폐기 이후 시작한 인증 조회는 거부한다. 권한 변경과 Redis 장애에도 같은 규칙을 유지한다.
- 로그인은 Redis 원자 카운터로 계정당 10회/분·100회/시간, 전송 peer당 60회/분으로 제한한다. 전달 헤더는 IP로 신뢰하지 않는다. 프록시 뒤의 peer 제한은 여러 사용자가 공유할 수 있다. 제한은 429와 Retry-After로 알리고 Redis 장애 시 신규 로그인은 503, 기존 세션의 DB 인증은 유지한다.
- 신규 비밀번호는 15자 이상·UTF-8 72바이트 이하, 공백·반복·기본 흔한 암호 목록을 거부한다. BCrypt 기존 해시는 유지하며 긴 입력을 조용히 잘라내지 않는다. 기본 목록은 전체 유출 암호 데이터베이스를 대체하지 않는다.
- 웹은 프레임 삽입·object·base-uri CSP를 강제하고 스크립트·이미지·편집기 정책은 Report-Only로 관찰한다. X-Frame-Options, nosniff, Referrer-Policy를 함께 설정한다.

## 민감 데이터 규칙

설치형 앱의 [기기 전용 모드](product-specs/device-only-workspace.md)는 개인 작업 API의 로컬 어댑터·Canvas 저장/이미지 처리·실시간 연결 경계에서 서버 전송을 차단한다. 미지원 기능은 실패하고 서버로 fallback하지 않는다. 기기 자료 ID와 초안/재시도 namespace를 분리하여 서버 모드 복귀 시 자동 업로드하지 않는다. IndexedDB는 계정별로 논리 구분하지만 기기 잠금/암호화 금고를 대체하지 않는다. 기기 모드 로그아웃은 서버 세션 폐기를 요청할 수 없고 로컬 표시만 지운다. 공유 기기 정리와 개인정보가 포함된 백업 보관에 주의한다.

- `.env`, `.env.local`, 토큰, DB 덤프, 업로드 원본, 로컬 인증 정보는 문서나 Git 추적 대상에 넣지 않는다.
- 문서에는 환경 변수 이름과 용도만 적고 실제 값을 적지 않는다.
- 오류 로그는 원인 파악에 필요한 범위로 제한하고 비밀번호, 토큰, 개인 파일 내용을 포함하지 않는다.

## Windows·Android 직접 배포 업데이트

1.1.0부터 별도 RSA SHA-256 서명 feed를 앱의 고정 공개키로 검증한다. production/staging origin·payload 채널·플랫폼·정식 버전·허용된 정확한 artifact URL·크기·SHA-256을 확인한다. Windows GitHub artifact redirect는 HTTPS GitHub/release-assets/objects 호스트만 허용한다. Android APK는 고정 cloud origin에서 redirect 없이 받으며 현재 패키지·서명 인증서·상승 versionCode도 확인한다. 설치 직전 파일을 재검증한다.

다운로드는 인증 쿠키·서버 토큰을 사용하지 않는다. native updater는 renderer의 IPC/JS bridge를 열지 않는다. Android content provider는 비공개이며 앱 내부 APK 한 파일만 OS installer에 read-only로 권한을 전달한다. 자동 다운로드와 사용자 승인 설치를 구분한다. Windows Authenticode가 없는 최초 설치는 HTTPS 출처·공개 SHA256SUMS 확인이 필요하다. feed 개인키와 Android 기존 운영 서명키는 저장소/보고서/artifact에 넣지 않고 외부 운영자 전용 저장소에서 보관한다.

## 고위험 영역

iOS/iPadOS 1.1.0 WKWebView는 환경별 고정 HTTPS origin에서만 내부 탐색하며 URL credential·HTTP/file/javascript/data/intent를 차단한다. 외부 HTTPS/mailto/tel은 사용자 동의 후 OS에서 연다. originWhitelist 전체 허용은 기본 OS fallback을 막고 모든 URL을 자체 fail-closed 검사로 보내기 위한 것으로, 내부 신뢰 origin을 늘리지 않는다. persistent WK 쿠키 저장소의 HttpOnly 세션을 사용하고 기존 Expo 토큰을 주입하지 않는다. 앱 JS bridge는 인증된 웹의 bounded export 데이터만 받고 정확한 schema·origin·base64·MIME·8MiB·파일명 제한 및 native 사용자 확인 후 cache→share→삭제 순서를 적용한다. 일반 네이티브 호출/쿠키·파일 읽기/임의 네트워크 요청은 없다. 세부 계약은 [iOS 사양](product-specs/ios-ipados-testflight.md)을 따른다.

- 인증과 세션: `flownote-server`의 auth service와 session table.
- 업로드: 파일 크기, MIME 타입, 저장 경로, 공개 URL 처리.
- 외부 API: Yahoo Finance, Google GenAI, MCP 연동.
- SQL: Flyway migration, Spring JDBC, Go pgx query.
- 모바일/Expo web: 공개 gateway URL, 개발용 HTTP cleartext, 운영 HTTPS 전환, 로컬 토큰 저장.

## 필수 점검

- API 변경 시 인증 없는 요청이 보호되는지 확인한다.
- 사용자별 데이터 조회는 `user_id` 조건을 포함한다.
- 업로드와 외부 API 오류는 사용자에게 안전한 메시지로 변환한다.
- DB 마이그레이션은 민감 데이터 기본값이나 불필요한 공개 컬럼을 만들지 않는다.
- 보안 민감 변경은 `.codex/skills/security-review` 또는 `.codex/prompts/security-scan.md` 기준으로 검토한다.

## Markdown 노트 후보 (2026-10-19)

노트 초안은 IndexedDB의 사용자/노트별 키로 격리하며 토큰을 저장하지 않는다. ack/rebase는 sequence를 한 transaction에서 비교한다. 명시적 로그아웃에서 미저장 초안 삭제를 확인하고 해당 계정만 정리한다. 세션 만료 때는 계정별로 보존하며 다른 사용자에게 읽히지 않는다. 저장소 접근 실패는 내보내기를 안내한다. 로컬 초안은 브라우저 origin 저장소이며 공유 기기에서 비밀 저장소를 대신하지 않는다.

미리보기는 raw HTML을 실행하지 않고 URL·KaTeX trust를 제한한다. legacy 전환 원본은 서버가 보관하며 client backup 교체와 구형 배열 downgrade는 거부한다. summary/detail도 기존 인증 middleware와 user_id 조건을 적용한다. [Blog 코드맵](design-docs/blog/blog.md)의 rollout과 신뢰 환경 검증을 따른다.
