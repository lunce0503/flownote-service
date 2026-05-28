# 품질 상태

이 문서는 Flownote의 품질 상태를 점수보다 근거 중심으로 추적한다. 실제 게이트는 `.codex/checklists/quality-gate.md`, `.codex/harness/verification-matrix.md`, 각 하위 프로젝트 빌드 명령이다.

## 현재 품질 게이트

| 영역 | 기본 게이트 | 상태 기록 방식 |
| --- | --- | --- |
| Vite React | `cd flownote && yarn build` | UI 변경마다 최종 응답에 결과 기록 |
| Spring | `cd flownote-server && ./gradlew test` | DB/API 변경마다 실행, 로컬 권한 문제 시 Docker 빌드로 보완 |
| FastAPI | `cd flownote-API && uv run ...` | 변경한 모듈에 맞는 compile/test 실행 |
| Next.js | `cd flownote-next && yarn lint && yarn build` | Next 변경 시 실행 |
| Docker | `docker compose up -d --build` | 작업 종료 전 통합 빌드와 백그라운드 실행 확인 |
| Cloud deploy | Vercel production deploy, Railway deploy/healthcheck | 운영 반영 요청 시 배포 URL과 헬스체크 결과를 `report/`에 기록 |

## 품질 관점

- API 계약: 서버 응답 형태와 프론트 타입이 일치한다.
- 데이터 안정성: 마이그레이션 순서, 기본값, 기존 데이터 호환성을 확인한다.
- UX 완결성: 로딩, 빈 상태, 오류, 성공 상태가 있다.
- 보안: 인증, 사용자별 데이터 격리, 비밀값 노출 방지를 확인한다.
- 운영성: Docker Compose에서 전체 서비스가 부팅된다.

## 알려진 취약 지점

- 일부 로컬 Gradle 캐시와 `build/` 폴더가 root 소유가 되어 로컬 `./gradlew test`가 실패할 수 있다. 이 경우 원인을 최종 응답에 기록하고 Docker 내부 빌드 성공 여부를 별도 확인한다.
- `docs/generated/db-schema.md`는 수동 작성 문서이므로 새 마이그레이션 이후 드리프트가 생길 수 있다.
- 여러 서비스가 같은 PostgreSQL을 공유하므로 마이그레이션 변경은 Spring, Next, React 호출부를 함께 확인해야 한다.

## 검토 주기

- DB/API 변경 후 `docs/generated/db-schema.md`를 확인한다.
- 반복되는 버그는 `.codex/memories/known-risks.md` 또는 이 문서에 남긴다.
- 품질 기준이 반복적으로 누락되면 문서가 아니라 체크리스트나 테스트로 승격한다.
