# 주요 기술 부채 해소 보고

## 범위

- 웹 TypeScript/ESLint gate 복구
- route lazy loading과 편집기 vendor 분할
- Canvas 스트리밍·포인터 입력 경계 분리
- chat 낙관적 액션 정리와 빈/얇은 계층 제거
- Playwright 캔버스 저장 E2E
- Go/Spring/AI 핵심 계약 테스트와 Go module checksum
- AI 비밀값 없는 부팅 및 내부망 capability 계약
- agent-note 세션 검증과 사용자별 인덱스 격리

## 결과

| 영역 | 이전 | 현재 |
| --- | --- | --- |
| ESLint | 65 errors, 13 warnings | 0 errors, 0 warnings |
| TypeScript | 설정 오류로 중단 | `tsc -b` 통과, build 선행 gate |
| 초기 JS entry | 약 3,139KB | 약 294KB |
| 최대 지연 청크 | main에 통합 | BlockNote 약 681KB, 700KB 회귀 기준 |
| Canvas.tsx | 997줄 | 763줄 |
| 웹 E2E | 없음 | 로그인→선 입력→저장 ack 1건 |
| AI 무키 부팅 | import 단계 실패 | health/capability 정상 부팅 |
| Go dependency checksum | `go.sum` 없음 | 두 모듈 모두 생성 |

## 검증

- `cd flownote && yarn verify`: 통과
- 공식 Playwright 1.62.1 컨테이너 `yarn e2e`: 1 passed
- `cd flownote-API && uv run pytest -q`: 14 passed
- `cd flownote-ai && uv run pytest -q`: 6 passed
- `cd flownote-server && ./gradlew test`: 통과
- Go 1.23 컨테이너에서 두 모듈 `go test ./...`: 통과

## 남은 위험

- Spring/Go CRUD의 실제 PostgreSQL 통합 테스트는 제한적이다.
- BlockNote 편집기는 지연 로드지만 약 681KB라 700KB 회귀 기준을 지속 관찰해야 한다.
- Ollama agent-note는 의도적으로 내부망 전용이며 Railway에서는 capability가 비활성이다.

## 통합 실행과 배포

- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 성공. 호스트 6379는 기존 `village-finance-redis`가 사용 중이라 저장소의 지원 변수로 충돌을 피했다.
- 로컬 health: gateway, Spring, canvas, serve, AI capability, Vite nginx 모두 정상.
- Railway `flownote-main`: `87dee6c1-3065-4ab7-b05e-14b58f5c90e6` (`SUCCESS`)
- Railway `flownote-canvas`: `134867e8-1364-419d-9646-e9de2d1c6ce8` (`SUCCESS`)
- Railway `flownote-serve`: `203f1fbb-6d8e-46a0-8b59-36ee56bdfef3` (`SUCCESS`)
- Railway `flownote-ai`: `5051cfd2-45d9-4d9a-a301-e84923812974` (`SUCCESS`, agent-note 세션 격리 반영)
- Railway `flownote-api`: `d755556a-15cf-4502-a675-18ef5dd4f144` (`SUCCESS`)
- Vercel web: `dpl_6Lcq3kCg4swJY6qyQcCH2TFRfnv8` (`READY`), `https://flownote-react.vercel.app`
- 운영 `GET /api/capabilities`: gateway 프록시 포함 HTTP 200, Gemini enabled, agent-note disabled.
