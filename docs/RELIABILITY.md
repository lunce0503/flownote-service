# Reliability

## Local Runtime

Flownote의 기준 실행 방식은 저장소 루트의 Docker Compose다. 개별 하위 프로젝트 검증 후에도 최종적으로 `docker compose up -d --build`를 실행해 서비스 연결을 확인한다.

## Service Expectations

| 서비스 | 기대 상태 |
| --- | --- |
| `db` | PostgreSQL healthy |
| `spring-server` | `8080`에서 인증, 작업, 노트, 소셜, 주식, 모바일 설정 API 제공 |
| `api-server` | `8000`에서 AI/market data API 제공 |
| `react-app` | `5173`에서 Vite 앱 정적 서빙 |
| `next-app` | `3000`에서 Next 앱 실행 |
| `mobile-app` | `8081`, `19000-19002`에서 Expo/Metro 실행 |

## Verification Loop

1. 변경한 하위 프로젝트의 가장 좁은 빌드 또는 테스트를 실행한다.
2. API나 DB 계약이 바뀌면 호출하는 프론트 화면도 빌드한다.
3. 루트에서 `docker compose up -d --build`를 실행한다.
4. `docker compose ps`로 컨테이너 상태를 확인한다.
5. 변경한 라우트나 API에 `curl` 또는 브라우저 확인을 수행한다.

## Failure Reporting

실패 보고에는 다음을 포함한다.

- 실패한 명령
- 실패한 서비스 또는 파일
- 핵심 오류 메시지
- 사용자가 바로 실행할 수 있는 다음 명령
- 검증하지 못한 잔여 리스크

## Observability Notes

- 현재 로컬 관측성은 Docker 로그와 브라우저 콘솔 확인이 중심이다.
- 장기적으로는 에이전트가 읽을 수 있는 로그/메트릭/트레이스 쿼리 경로를 문서화하고 자동화한다.
