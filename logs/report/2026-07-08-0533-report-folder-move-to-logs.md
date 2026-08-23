# report/ → logs/report/ 이동 및 참조 정리

- 일시: 2026-07-08 05:33 (로컬)
- 브랜치: `design/fsd-refactor` (변경은 미커밋 상태로 유지)
- 요청: "`logs/`에 report 폴더를 넣어서 관리해줘"

## 수행 내용

1. **폴더 이동**: 루트 `report/`(보고서 44개, `server-db-role-report.html` 포함) → `logs/report/`. 파일명 규칙(`YYYY-MM-DD-HHMM-내용.md`)은 그대로 유지한다.
2. **docker-compose.yml**: next-app 볼륨 `./report:/app/report:ro` → `./logs/report:/app/report:ro`. 컨테이너 내부 경로 `/app/report`는 유지했으므로 `REPORT_PATH=/app/report/server-db-role-report.html` 환경 변수는 변경 불필요.
3. **경로 참조 일괄 갱신** (`report/` → `logs/report/`):
   - 루트 지침: `CLAUDE.md`, `AGENTS.md`(CLAUDE.md 복사로 동기화), `GEMINI.md`, `ARCHITECTURE.md`(기록 위치 표)
   - Claude 하네스: `.claude/README.md`, `.claude/rules/common.md`, `.claude/checklists/{quality-gate,release-readiness}.md`, `.claude/harness/{routing,workflow}.md`
   - Codex 하네스: `.codex/` 동일 세트 + `.codex/README.md`의 `../report/`
   - docs: `docs/FRONTEND.md`, `docs/HARNESS.md`, `docs/QUALITY_SCORE.md`, `docs/RELIABILITY.md`
   - `docs/references/` 안의 과거 인용은 이력이므로 수정하지 않음
4. **.gitignore**: 5행 `report/` 제거. `logs/report/`는 기존 `logs/` 규칙으로 이미 무시된다.

## 발견 사항: flownote-next/app/report 라우트가 git에서 누락되어 있었음

`.gitignore`의 `report/` 패턴은 위치 무관 매칭이라 **`flownote-next/app/report/page.tsx`(Next 라우트 소스)까지 무시**하고 있었고, 이 파일은 지금까지 커밋된 적이 없다. 패턴 제거로 이제 untracked(`??`)로 드러난다. 소스 코드이므로 추적 대상에 넣는 것을 권장하나, 커밋은 명시 요청이 없어 보류했다.

## 검증

- `REDIS_HOST_PORT=6380 docker compose config --quiet` → 통과
- `REDIS_HOST_PORT=6380 docker compose up -d --build` 및 next-app 컨테이너에서 `/app/report/server-db-role-report.html` 마운트 확인 → 결과는 최종 응답 참조
- 남은 `report/` 참조 스캔(backtick 인용·볼륨 문법 기준) → 0건 (references/ 이력 제외)

## 후속 조치 후보

- 이번 변경(추적 파일: docker-compose.yml, .gitignore, CLAUDE/AGENTS/GEMINI/ARCHITECTURE, .claude·.codex 하네스, docs 4종)은 성격상 `docs/harness` 브랜치 소속이 자연스럽다. 커밋 시 브랜치 배치 결정 필요.
- `flownote-next/app/report/page.tsx` 추적 여부 결정.
