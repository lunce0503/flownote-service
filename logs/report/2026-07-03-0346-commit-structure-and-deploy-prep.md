# 커밋 구조 정리 · 내부망 개선 · 배포 준비 보고서

작성일: 2026-07-03 03:46
대상 브랜치: `chore/backend-mobile-deploy-prep`
계획: `~/.claude/plans/tingly-singing-mccarthy.md` (배포 준비 계획, 승인됨)
PR: https://github.com/lunce0503/flownote-service/pull/1

## 요약

미커밋으로 뒤섞여 있던 스프린트 코드·문서·하네스 변경을 **성격별 7개 논리 커밋**으로 분리하고, 저장소에 들어가면 안 되는 잡파일을 제외했다. 내부망(Part 2)의 redis 호스트 포트를 파라미터화해 임시 override 없이 포트 충돌을 우회할 수 있게 했다. main으로 PR을 생성했고, 커밋된 compose만으로 Docker 통합 기동을 검증했다.

## Part 1 — 커밋 구조 (성격별 분할)

`git log` 기준(최신 → 과거):

1. `docs: sync design/quality docs, add claude harness` — docs/*, .codex/*, AGENTS/GEMINI/CLAUDE.md, `.claude/` 하네스(34파일, `settings.local.json` 제외)
2. `chore(compose): parameterize redis host port` — docker-compose.yml, .env.example
3. `chore(next): ignore .vercel output in eslint`
4. `refactor(web): route from capability manifest` — App.tsx, capabilityManifest.tsx
5. `chore(api): pin build to uv.lock, add pytest gate` — Dockerfile, pyproject.toml, uv.lock
6. `fix(api): enforce canvas socket room auth, offload MCP core calls` — canvas_socket.py, core_api.py, mcpServers/*, tests
7. `chore: ignore stray local files, drop legacy harness doc` — .gitignore + `하네스 엔지니어링.md` 삭제

### 잡파일 제외 (사용자 결정: 모두 저장소에서 제외)
`.gitignore`에 추가: `.antigravitycli/`(Gemini 설정 심볼릭 링크), 루트 `/package.json`·`/package-lock.json`(wrangler 실험), `/architecture-diagram.html`, `.claude/settings.local.json`(로컬 권한 설정).

### 관찰된 기존 이슈 (수정하지 않음)
- 기존 `.gitignore`가 `docs/`·`.codex/`·`AGENTS.md`·`GEMINI.md`를 ignore하지만 이들은 이미 추적 중이라 수정분은 정상 커밋된다. ignore 규칙이 무력화된 혼란스러운 상태지만, 사용자의 기존 설정을 임의로 되돌리지 않기 위해 그대로 두었다. 향후 이 디렉터리에 **새 파일**을 추가하려면 `git add -f`가 필요하다.

## Part 2 — 내부망 (redis 파라미터화)

- `docker-compose.yml`: redis `6379:6379` → `${REDIS_HOST_PORT:-6379}:6379`. 기본값 6379로 동작 불변. 내부 서비스 통신은 `redis:6379` 그대로.
- `.env.example`: `REDIS_HOST_PORT` 설명 추가. `HOST_LAN_IP`는 이미 문서화돼 있었음.
- 효과: 호스트 6379를 `village-finance-redis`(11일째 점유)가 잡고 있어도, `REDIS_HOST_PORT=6380`만 주면 임시 override 파일 없이 기동 가능.

## 검증

- 7개 커밋 후 `git status` 클린(ignore된 잡파일만 남음).
- `git push` 성공, PR #1 생성.
- **Docker 통합(커밋된 compose만, override 파일 미사용)**: `REDIS_HOST_PORT=6380 docker compose up -d --build` → 7개 컨테이너 running.
  - redis 포트 매핑 `0.0.0.0:6380->6379` 확인(파라미터화 동작).
  - Spring `/actuator/health` → `{"status":"UP"}`.
  - FastAPI `/` → 200 `{"message":"Hello, World!"}`.

## 클라우드 배포 — 이번 단계에서는 미실행 (의도된 보류)

계획(Part 3)상 클라우드 배포는 **main 병합 후** 진행하며, `railway login`·`vercel login`이 사용자 인증을 요구한다. 현재는 PR 생성까지가 범위다.

- 배포 대상: `flownote-server` → Railway `flownote-main`, `flownote-API` → Railway `flownote-api`, `flownote`·`flownote-next` → Vercel.
- 다음 조치: (1) PR #1 리뷰·main 병합, (2) 사용자가 `! railway login` / `! vercel login` 실행, (3) Part 3 배선(Railway private network, Vercel env, CORS)·배포·헬스체크.

## 다음 단계 (계획 Part 3·4)

- Part 3 클라우드 배포: main 병합 + 로그인 후 실행.
- Part 4 모바일: `! eas login`(Expo 계정) → `eas init` → `eas.json` placeholder URL을 Railway Spring public URL로 교체 → `eas build -p android --profile preview`(APK). iOS는 Apple Developer 계정 확보 후.
