# Flownote 작업 목록 HTML 응답 오류

## 증상

- `flownote` 홈페이지 또는 작업 화면 접근 시 브라우저 콘솔에 `Uncaught TypeError: e.filter is not a function` 오류가 발생했다.
- `Fetched tasks:` 로그에는 작업 배열 대신 `<!doctype html>...` 형태의 HTML 문서가 출력되었다.
- 화면 렌더링 중 `tasks.filter(...)` 호출이 실행되면서 앱 접근이 막혔다.

## 영향 범위

- 하위 프로젝트: `flownote/`
- 주요 파일:
  - `flownote/src/entities/task/api/getTaskData.ts`
  - `flownote/src/entities/blog/getNoteData.ts`
  - `flownote/src/entities/blog/noteFolderData.ts`
  - `flownote/src/features/canvas/model/usePersistence.tsx`
  - `flownote/src/entities/schedule/api.ts`
  - `flownote/src/widgets/TaskWidget/DailySchedulePanel.tsx`
  - `flownote/src/widgets/TaskWidget/TaskTable.tsx`
  - `flownote/Dockerfile`
  - `docker-compose.yml`

## 원인

작업 API 호출 결과가 배열이라고 가정하고 상태에 저장했다. 프로덕션 정적 호스트나 잘못된 API 기본 URL에서 `/api/tasks` 요청이 HTML fallback으로 응답하면 문자열이 `tasks` 상태에 들어가고, 이후 `filter` 호출에서 런타임 오류가 발생한다.

## 수정 방향

- 작업 API 응답을 배열 또는 `{ tasks: [...] }` 형태로만 정규화한다.
- 배열이 아닌 응답은 빈 배열로 처리하고 경고 로그를 남긴다.
- `TaskTable`도 상태 업데이트 전에 배열 여부를 한 번 더 확인한다.
- 시간표 API 응답도 배열 또는 `{ scheduleItems: [...] }`, `{ schedule_items: [...] }` 형태로만 정규화한다.
- `DailySchedulePanel`도 상태 업데이트 전에 배열 여부를 확인한다.
- 노트와 노트 폴더 API 응답도 배열 형태로 정규화한다.
- 캔버스 로드는 JSON이 아닌 응답을 빈 캔버스로 처리한다.
- Vite 앱 Docker 빌드에 `VITE_CORE_API_URL`, `VITE_CANVAS_API_URL`, `VITE_UPLOAD_API_URL` 빌드 인자를 전달한다.
- 초기 로딩 상태는 `fetchTasks`가 끝난 뒤 해제하도록 정리한다.

## 추가 확인

- Vercel `flownote` 프로젝트에는 `VITE_CORE_API_URL` Production 환경 변수가 없다.
- 로컬 Spring API의 `/api/tasks`와 `/api/schedule-items`는 존재하며, 인증 없이 호출하면 HTML이 아니라 JSON `401`을 반환한다.
- 로컬 Spring API의 `/api/notes`, `/api/note-folders`, `/api/canvas/load`도 존재하며, 인증 없이 호출하면 HTML이 아니라 JSON `401`을 반환한다.
- 로컬 Docker DB의 `tasks` 테이블에는 7개 row가 있어 빈 테이블 상태는 아니다.

## 검증

- `flownote/`에서 `yarn build` 성공.
- Vercel 프로덕션 배포 성공: `https://flownote-wine.vercel.app`
- 루트에서 `docker compose up -d --build` 성공.
- `docker compose ps`에서 `db`, `spring-server`, `api-server`, `react-app`, `next-app`, `mobile-app` 실행 확인.
