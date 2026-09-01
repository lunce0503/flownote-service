# Railway latency region fix

## 범위

- production Railway 로그·메트릭 조사
- API, Canvas, Spring 서비스 리전 정렬
- 배포 설정과 운영 문서에 리전 기준 고정

## 조사 결과

- 변경 전 앱 서비스: `us-west2`
- 변경 전 PostgreSQL·Redis: `asia-southeast1-eqsg3a`
- Canvas 목록: 최초 약 2.7초, 웜 약 530ms
- 사용자 API: 약 599~1,123ms
- CPU·메모리 포화와 5xx는 없음

## 운영 변경

- `flownote-api`: Singapore, deployment `d2abac4b-5a6f-41ac-ac3c-ea514a84b6ef`
- `flownote-canvas`: Singapore, deployment `f4d0a2f9-cd64-412b-ab1f-986c8b5c803d`
- `flownote-main`: Singapore, deployment `ea358784-7761-4287-bf91-43ce78227143`

초기 패치는 기존 Oregon 리전을 병합해 무료 플랜의 다중 리전 제한으로 실패했다. 서비스 중단 없이 기존 성공 배포가 유지됐고, Oregon 키를 명시적으로 제거한 단일 Singapore 패치로 수정했다.

## 확인 결과

- `uv run pytest -q`: 14 passed
- `./gradlew test`: passed
- Docker 기반 `go test ./...`: passed
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: passed
- Canvas 인증 DB 조회: 최종 deployment에서 Railway 내부 7~26ms
- 사용자 API: 최종 deployment에서 첫 연결 496ms, 이후 Railway 내부 30~33ms
- API `/`, Canvas `/health`, Spring `/actuator/health`: 모두 HTTP 200
- 새 배포 이후 확인 구간에서 5xx 없음
- Vercel production: `dpl_DDQP6ZdLaa7MvSK7SELwGoAGQ2sb`, alias `https://flownote-react.vercel.app`, HTTP 200
