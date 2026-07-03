# Flownote 문서 지도

이 디렉터리는 Flownote의 버전 관리되는 지식 베이스다. 루트 `AGENTS.md`와 `.codex/`는 작업 규칙과 하네스 자산을 제공하고, `docs/`는 제품, 아키텍처, 품질 상태, 실행 계획을 에이전트와 사람이 함께 읽을 수 있는 기록 시스템으로 유지한다.

참고 원칙: OpenAI의 하네스 엔지니어링 글(https://openai.com/ko-KR/index/harness-engineering/)은 `AGENTS.md`를 거대한 매뉴얼이 아니라 목차로 취급하고, 깊은 지식은 구조화된 `docs/`에 둔다고 설명한다. Flownote도 같은 방향으로 짧은 진입점, 명확한 소유 문서, 검증 가능한 체크리스트를 우선한다.

## 읽는 순서

1. `AGENTS.md`/`CLAUDE.md`: 항상 적용되는 작업 규칙과 검증 의무.
2. `.codex/README.md`/`.claude/README.md`: Codex/Claude code 하네스 자산의 위치와 역할.
3. `docs/PRODUCT_SENSE.md`: 제품 목적과 주요 사용자 흐름.
4. `docs/DESIGN.md`: 하위 프로젝트와 아키텍처 경계.
5. `docs/PLANS.md`: 실행 계획과 기술 부채 관리 방식.
6. `docs/QUALITY_SCORE.md`: 품질 상태와 개선 추적.
7. `docs/FRONTEND.md`, `docs/SECURITY.md`, `docs/RELIABILITY.md`: 관심사별 운영 기준.

## 디렉터리 구조

| 경로 | 역할 |
| --- | --- |
| `design-docs/` | 장기 설계 문서와 아키텍처 결정 색인 |
| `generated/` | 코드나 스키마에서 재생성 가능한 참조 문서 |
| `product-specs/` | 제품 기능별 사양과 사용자 흐름 |
| `exec-plan/` | 실행 계획 설정 문서 |
| `references/` | 외부 문서/docs 자료 보관 |
| `DESIGN.md` | 시스템 맵과 서비스 경계 |
| `FRONTEND.md` | 웹/모바일 UI 작업 기준 |
| `PLANS.md` | 계획 문서 작성과 완료 기록 기준 |
| `PRODUCT_SENSE.md` | 제품 원칙과 우선순위 |
| `QUALITY_SCORE.md` | 품질 게이트와 현재 리스크 |
| `RELIABILITY.md` | 로컬/통합 실행, 관측, 복구 기준 |
| `SECURITY.md` | 인증, 비밀값, 업로드, 외부 API 보안 기준 |

## 관리 규칙

- 새 기능이 제품 행동을 바꾸면 `product-specs/` 또는 관련 최상위 문서를 갱신한다.
- 아키텍처 경계, DB, 런타임, 검증 명령이 바뀌면 `DESIGN.md`, `generated/`, `.codex/harness/` 중 실제 기준 문서를 갱신한다.
- 임시 계획은 작업 중 응답에 남겨도 되지만, 긴 계획과 반복될 의사결정은 `PLANS.md` 기준에 따라 문서화한다.
- 오래된 문서는 삭제보다 정정이 우선이다. 더 이상 사실이 아니면 근거와 대체 위치를 남긴다.
- 비밀값, 토큰, 로컬 인증 정보, 업로드 원본, DB 덤프는 `docs/`에 기록하지 않는다.
