# 보안

## 보안 모델

Flownote는 로그인 세션을 기반으로 사용자 데이터를 분리한다. 서버 API는 `Authorization` 헤더를 통해 사용자 ID를 확인하고, 사용자 소유 데이터는 `user_id` 조건으로 조회/수정/삭제해야 한다.

## 민감 데이터 규칙

- `.env`, `.env.local`, 토큰, DB 덤프, 업로드 원본, 로컬 인증 정보는 문서나 Git 추적 대상에 넣지 않는다.
- 문서에는 환경 변수 이름과 용도만 적고 실제 값을 적지 않는다.
- 오류 로그는 원인 파악에 필요한 범위로 제한하고 비밀번호, 토큰, 개인 파일 내용을 포함하지 않는다.

## 고위험 영역

- 인증과 세션: `flownote-server`의 auth service와 session table.
- 업로드: 파일 크기, MIME 타입, 저장 경로, 공개 URL 처리.
- 외부 API: Yahoo Finance, Google GenAI, MCP 연동.
- SQL: Flyway migration, JDBC query, Prisma schema.
- 모바일 WebView: WAS 설정 URL, HTTP cleartext, 운영 HTTPS 전환.

## 필수 점검

- API 변경 시 인증 없는 요청이 보호되는지 확인한다.
- 사용자별 데이터 조회는 `user_id` 조건을 포함한다.
- 업로드와 외부 API 오류는 사용자에게 안전한 메시지로 변환한다.
- DB 마이그레이션은 민감 데이터 기본값이나 불필요한 공개 컬럼을 만들지 않는다.
- 보안 민감 변경은 `.codex/skills/security-review` 또는 `.codex/prompts/security-scan.md` 기준으로 검토한다.
