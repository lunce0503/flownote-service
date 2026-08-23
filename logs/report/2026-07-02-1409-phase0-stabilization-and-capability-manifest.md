# Phase 0 안정화 + 역량 매니페스트 첫 스프린트 보고서

작성일: 2026-07-02 14:09
대상 브랜치: `chore/backend-mobile-deploy-prep`
계획: [/home/kwon/.claude/plans/tingly-singing-mccarthy.md](/home/kwon/.claude/plans/tingly-singing-mccarthy.md) "첫 스프린트"
근거 진단: [2026-07-02-1158-current-issues-audit.md](/home/kwon/Flownote/service/report/2026-07-02-1158-current-issues-audit.md)

## 요약

승인된 2026 로드맵의 첫 스프린트 4개 항목(보안 2건 + 품질 게이트 + 역량 매니페스트)을 모두 구현하고 검증했다. 실행 중인 Docker 스택에서 소켓 인증 수정을 end-to-end로 확인했다.

## 변경 사항

### 1. 캔버스 소켓 인증·룸 멤버십 검증 (진단 5번)
- [flownote-API/app/canvas_socket.py](/home/kwon/Flownote/service/flownote-API/app/canvas_socket.py)
  - 모듈 함수 `_require_room_membership(rooms, canvas_id)` 추가: 발신자가 `canvas:join`(코어 메타데이터 권한 검증을 거치는 유일한 경로)으로 해당 룸에 들어와 있지 않으면 403.
  - `canvas:line-start`·`canvas:line-points`·`canvas:line-end` 세 핸들러가 브로드캐스트 전 `_require_room_membership(sio.rooms(sid), canvas_id)` 호출.
  - 이전에는 미인증 클라이언트가 임의 `canvasId` 룸에 선 데이터를 주입할 수 있었음.
- [flownote-API/tests/test_canvas_socket.py](/home/kwon/Flownote/service/flownote-API/tests/test_canvas_socket.py): 멤버십 허용/거부/룸없음 3개 단위 테스트 추가.

### 2. MCP 도구 이벤트 루프 블로킹 제거 (진단 3번)
- [flownote-API/app/core_api.py](/home/kwon/Flownote/service/flownote-API/app/core_api.py): `forward_request_async`(= `asyncio.to_thread(forward_request, ...)`) 공용 헬퍼 추가.
- [note_tools.py](/home/kwon/Flownote/service/flownote-API/mcpServers/note_tools.py)·[task_tools.py](/home/kwon/Flownote/service/flownote-API/mcpServers/task_tools.py)·[schedule_tools.py](/home/kwon/Flownote/service/flownote-API/mcpServers/schedule_tools.py): async 컨텍스트에서 직접 호출하던 동기 `forward_request`를 모두 `await forward_request_async(...)`로 교체.
- 확인: social/chat 라우터·chat_service·canvas_socket은 이미 `asyncio.to_thread`로 감싸고 있었음. MCP 도구만 이벤트 루프(캔버스 실시간 포함)를 블로킹하던 유일한 지점이었고 이제 해소됨.

### 3. 품질 게이트 복구 (진단 7번)
- [flownote-next/eslint.config.mjs](/home/kwon/Flownote/service/flownote-next/eslint.config.mjs): `globalIgnores`에 `.vercel/**` 추가 → `.vercel/output` 생성 코드가 lint 대상에서 제외됨.
- [flownote-API/pyproject.toml](/home/kwon/Flownote/service/flownote-API/pyproject.toml): `[dependency-groups] dev`에 pytest·pytest-asyncio, `[tool.pytest.ini_options]`에 `pythonpath=["."]`, `testpaths=["tests"]` 추가.
- [flownote-API/Dockerfile](/home/kwon/Flownote/service/flownote-API/Dockerfile): `uv pip install -r pyproject.toml`(lock 무시) → `uv sync --frozen --no-install-project --no-dev`(lock 고정) + venv PATH 실행으로 전환.

### 4. 역량 모듈 매니페스트 도입 (로드맵 Phase 1-A 선행)
- [flownote/src/app/capabilityManifest.tsx](/home/kwon/Flownote/service/flownote/src/app/capabilityManifest.tsx) 신규: 각 기능을 `{id, label, nav, enabled, protected, routes}` 데이터로 표현. `enabled` 플래그로 조합·분리를 코드 수정 없이 토글. 블로그 중첩 라우트(`:title`) 보존.
- [flownote/src/app/App.tsx](/home/kwon/Flownote/service/flownote/src/app/App.tsx): 수동 `<Route>` 나열을 매니페스트 순회 생성으로 전환. `protected` 역량은 `ProtectedRoute`로 자동 래핑. 라우트 동작은 이전과 동일.
- 후속(이번 스프린트 범위 밖): Header 네비게이션·홈 대시보드·모바일 탭이 같은 매니페스트를 소비하도록 연결.

## 검증

- `flownote-API` `uv run pytest`: **12 passed**(기존 9 + 소켓 멤버십 3).
- `flownote-next` `yarn lint`: **통과**(에러 0). 수정 전 에러 20건.
- `flownote` `yarn build`: **성공**(11.3초). 매니페스트 리팩터 후 라우트 정상.
- `flownote-API` 이미지 단독 빌드 + `--env-file` 기동: 루트 `GET /` → `{"message":"Hello, World!"}` 200, uvicorn 정상.
- `docker compose up -d --build`: 이미지 5개 모두 **Built**. 기본 실행은 호스트 6379 포트 충돌(아래)로 실패 → 임시 override로 flownote redis 호스트 포트만 6380으로 매핑해 기동. **7개 컨테이너 모두 정상**(db·redis healthy, spring actuator `{"status":"UP"}`, api 200).
- **소켓 인증 end-to-end**: 실행 중인 api 컨테이너에 python-socketio 클라이언트로 접속 후 `canvas:join` 없이 `canvas:line-points` 방출 → `{'ok': False, 'status': 403, 'error': '캔버스 세션에 먼저 참여해야 합니다.'}` 반환 확인.

### 환경 이슈: 호스트 6379 포트 충돌
- 다른 프로젝트 컨테이너 `village-finance-redis`(11일째 실행)가 호스트 6379를 점유 중. flownote redis의 `6379:6379` 매핑과 충돌.
- 남의 컨테이너이므로 중단하지 않고, 커밋된 `docker-compose.yml`은 그대로 둔 채 job tmp의 임시 override(`6380:6379`)로 검증. 서비스 간 통신은 내부 네트워크 `redis:6379`를 쓰므로 영향 없음.
- 후속 권장: 로컬 개발 편의를 위해 flownote redis 호스트 포트를 `${REDIS_HOST_PORT:-6379}:6379`처럼 환경변수화하는 방안 검토.

## Git / 배포 상태

- **커밋 안 함**: 변경분은 작업 트리에 있으며, 사용자 확인 없이 커밋하지 않았다. 변경 파일: flownote-API 8개(Dockerfile, canvas_socket.py, core_api.py, note/task/schedule_tools.py, pyproject.toml, tests, uv.lock), flownote-next/eslint.config.mjs, flownote/src/app/App.tsx, 신규 flownote/src/app/capabilityManifest.tsx.
- **클라우드 배포 생략**: 아래 사유로 프로덕션 자동 배포를 진행하지 않음.
  - 안정화(Phase 0) 진행 중이며 배포 준비 feature 브랜치 상태.
  - 승인된 계획의 첫 스프린트 검증 항목에 프로덕션 배포가 포함되지 않음(로컬·Docker 검증까지).
  - 진행 중인 캔버스 실시간 기능의 잔여 이슈가 남아 있어, 명시적 승인 없이 프로덕션에 내보내는 것은 위험(계획 수립 시 사용자와 확인한 사항).
  - 배포 시 명령: `flownote/`·`flownote-next/` → Vercel production, `flownote-API/` → Railway `flownote-api`.
  - 다음 조치: 사용자가 이번 스프린트 변경을 커밋·푸시하고 배포 승인 시 위 대상 배포 진행.

## 남은 Phase 0 항목(다음 스프린트)
- 진단 4번: 노트 목록 N+1 R2 읽기 구조 개선(메타 전용 목록 + 단건 조회) — flownote-server 변경 필요.
- 진단 8번: 모바일 409 충돌 복구.
- 진단 9번: `canvas_load` gather unpack의 `isinstance(x, Exception)` → `BaseException` 확대.
