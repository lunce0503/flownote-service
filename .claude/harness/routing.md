# 라우팅

규칙, 프롬프트, 검증 명령을 선택할 때 이 가이드를 사용한다.

| 요청 유형 | 주요 자산 | 검증 |
| --- | --- | --- |
| Vite UI 변경 | `rules/typescript-react.md`, `checklists/frontend.md` | `cd flownote && yarn build` |
| Next.js 변경 | `rules/typescript-react.md`, `checklists/frontend.md`, `checklists/backend.md` | `cd flownote-next && yarn lint && yarn build` |
| FastAPI 변경 | `rules/python-fastapi.md`, `checklists/backend.md` | `cd flownote-API && uv run ...` |
| Spring 변경 | `rules/java-spring.md`, `checklists/backend.md` | `cd flownote-server && ./gradlew test` |
| DB 변경 | `rules/database.md`, `checklists/database.md` | migration과 영향받는 앱 검증 |
| Docker/runtime 변경 | `rules/docker.md`, `checklists/release-readiness.md` | compose 영향 검증 |
| 보안 리뷰 | `prompts/security-scan.md` | targeted inspection과 test |
| 일반 리뷰 | `prompts/code-review.md` | diff와 관련 검사 |
| 런타임 버그 | `logs/bugs/`, `checklists/quality-gate.md` | 재현 증상 기록, 관련 하위 프로젝트 빌드 |
| 감사/배포 결과 | `logs/report/`, `checklists/release-readiness.md` | 산출물 기록, 필요한 통합 검증 |
