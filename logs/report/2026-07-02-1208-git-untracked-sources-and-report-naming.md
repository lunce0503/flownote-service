# 커밋 누락 해소, 빌드 산출물 추적 제거, 보고서 명명 규칙 고정 보고서

작성일: 2026-07-02 12:08
대상 브랜치: `chore/backend-mobile-deploy-prep`
근거 진단: [2026-07-02-1158-current-issues-audit.md](/home/kwon/Flownote/service/report/2026-07-02-1158-current-issues-audit.md) 1번·2번 항목

## 변경 사항

### 1. 커밋 누락 해소 (진단 1번) — 커밋 `f5c8a06`

- 조사 중 확인된 정정 사항: 최초 진단 때 status 출력 잘림으로 놓쳤으나, untracked 신규 파일뿐 아니라 이를 참조하는 추적 파일 수정분(`App.tsx`, `usePersistence.tsx`, `CanvasController.java`, `NoteService.java` 등 수십 개)도 전부 미커밋 상태였다. HEAD 단독으로는 빌드가 됐지만, 캔버스 실시간·note revision·배포 준비 작업 전체가 git에 없어 원격 빌드/배포가 로컬과 다른 코드를 보게 되는 상태였다.
- 해결: 로컬에서 검증 완료된(yarn build, gradlew test 통과) 소스 스냅숏을 통째로 커밋했다. 총 74개 파일.
  - flownote-API: `app/canvas_socket.py`(신규), `tests/test_canvas_socket.py`(신규), main.py·core_api.py·note_tools.py·pyproject.toml·uv.lock 수정분
  - flownote-server: 캔버스 스케줄러/아웃박스/진단 신규 클래스 8개, Flyway `V18`~`V20` 마이그레이션, 신규 테스트 5개, 수정된 서비스·컨트롤러·application.yml
  - flownote: `canvasDraftWorker.ts`·`canvasIndexedDb.ts`·`canvasSpatialIndex.ts`·`AdminCanvas/route.tsx`(신규), `Canvus.tsx → Canvas.tsx` 리네임, 수정된 캔버스 모델·위젯·공유 모듈
  - flownote-mobile, flownote-next 수정분, `docker-compose.yml`
- 문서(.codex/, docs/, AGENTS.md, GEMINI.md), 사용자가 삭제한 `하네스 엔지니어링.md`, 루트 잡파일(package.json, architecture-diagram.html, .antigravitycli/)은 커밋에서 제외했다.

### 2. 빌드 산출물 추적 제거 (진단 2번) — 커밋 `4e71c64`

- `.gitignore`에 `flownote-server/build/`, `flownote-server/.gradle/` 추가.
- `git rm -r --cached`로 인덱스에서 해당 경로의 추적 파일(.class 바이너리, gradle 캐시 등)을 제거했다. 디스크 파일은 그대로 유지되어 로컬 빌드에는 영향이 없다.
- 커밋 후 `git status`에서 build/.gradle 관련 항목 0건 확인.

### 3. 보고서 명명 규칙 고정

- [CLAUDE.md](/home/kwon/Flownote/service/CLAUDE.md), [AGENTS.md](/home/kwon/Flownote/service/AGENTS.md)의 기록 규칙에 다음을 추가:
  - `report/` 보고서 파일명은 `YYYY-MM-DD-HHMM-수정한내용.md` 형식으로 고정. 24시간제 로컬 시각, 내용은 케밥 케이스.
- 기존 진단 보고서를 새 규칙에 맞게 `2026-07-02-1158-current-issues-audit.md`로 리네임했다.
- CLAUDE.md와 AGENTS.md는 `.gitignore` 정책상 git 추적 대상이 아니거나 사용자 관리 문서라 커밋하지 않았다(작업 트리에만 반영).

## 검증

- `git status --porcelain | grep -c 'flownote-server/(build|.gradle)'`: 0건.
- `git diff HEAD -- flownote flownote-server/src flownote-API flownote-next flownote-mobile docker-compose.yml`: 차이 없음 (커밋 트리 = 검증된 작업 트리).
- `git grep canvas_socket HEAD`: `app/main.py`와 `app/canvas_socket.py` 모두 HEAD에 존재.
- 커밋된 소스 내용은 같은 날 로컬 검증을 통과한 작업 트리와 동일: `flownote` `yarn build` 성공, `flownote-server` `./gradlew test` 성공, `flownote-API` `import app.main` 성공.
- Docker 통합 빌드 결과는 최종 응답에 별도 기록.

## 남은 조치

- 진단 보고서의 3번(이벤트 루프 블로킹), 5번(소켓 인증), 7번(lint/pytest 게이트) 항목은 미해결 상태로 남아 있다.
- 브랜치 push 및 PR 생성은 사용자 결정 대기.
