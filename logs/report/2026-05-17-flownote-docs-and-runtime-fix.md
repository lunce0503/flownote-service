# Flownote 문서 정리 및 런타임 오류 수정 기록

## 범위

- `docs/`와 `.codex/`의 영문 제목/섹션명을 한국어 중심으로 정리했다.
- `AGENTS.md`에 코드 처리 단계, `logs/`, `report/` 사용 규칙을 추가했다.
- 비어 있던 `ARCHITECTURE.md`에 하위 프로젝트, 서비스 경계, 코드 처리 단계, 기록 위치, 검증 기준을 정리했다.
- `flownote/` 작업 목록 로딩 오류를 수정했다.

## 런타임 오류 수정

- 증상: 작업 API 응답이 HTML 문서로 들어와 `tasks.filter is not a function` 계열 오류가 발생했다.
- 원인: `getTaskData`와 `TaskTable`이 API 응답을 배열로 가정했다.
- 조치:
  - `getTaskData`에서 작업 응답을 배열로 정규화한다.
  - 배열이 아닌 응답은 빈 배열로 처리한다.
  - `TaskTable`에서 상태 저장 전 배열 여부를 재확인한다.
  - `listScheduleItems`에서 시간표 응답도 배열로 정규화한다.
  - `DailySchedulePanel`에서 상태 저장 전 배열 여부를 재확인한다.
  - `getNoteData`와 `getNoteFolders`에서 노트/폴더 응답도 배열로 정규화한다.
  - 캔버스 로드는 API URL 미설정 또는 JSON이 아닌 응답을 빈 캔버스로 처리한다.
  - `flownote/Dockerfile`과 `docker-compose.yml`에 Vite 빌드 인자를 추가해 Docker 빌드 시 DB API URL이 번들에 들어가게 했다.
  - 초기 로딩 상태 해제를 비동기 fetch 완료 후로 정리한다.

## API 상태 확인

- Vercel `flownote` Production 환경 변수에는 `VITE_CORE_API_URL`이 없다.
- 로컬 Spring `/api/tasks`, `/api/schedule-items`, `/api/notes`, `/api/note-folders`, `/api/canvas/load`는 존재하며 인증 없는 요청에는 JSON `401`을 반환한다.
- 로컬 Docker DB의 `tasks` 테이블에는 7개 row가 있다.

## 기록 규칙

- `logs/bugs/`: 재현 가능한 사용자 제보 버그와 원인 기록.
- `logs/`: 실행 로그 요약과 운영 증상 기록.
- `report/`: 리뷰, 감사, 배포 결과, 큰 작업 요약 기록.
- `.codex/memories/`: 반복 적용 가능한 안정적 컨벤션 후보 기록.

## 검증 결과

- `cd flownote && yarn build`: 성공.
- `npx vercel deploy --prod --cwd flownote --yes`: 성공.
- Vercel 프로덕션 별칭 확인: `https://flownote-wine.vercel.app` HTTP 200.
- 저장소 루트에서 `docker compose up -d --build`: 성공.
- `docker compose ps`: `flownote-db` healthy, `flownote-spring`, `flownote-api`, `flownote-react`, `flownote-next`, `flownote-mobile` 실행 확인.

## Railway 전환 시도

- Railway 로그인은 성공했다.
- Railway 프로젝트 이름은 `flownote`로 확인했다.
- 이전 서비스 링크는 깨진 상태이며 현재 Railway 프로젝트에는 서비스가 없고 `postgres-volume`만 detached 상태로 남아 있다.
- Vercel 로컬 설정 파일(`vercel.json`, `.vercelignore`, `.vercel/`)은 `flownote/`, `flownote-next/`, `flownote-API/`에서 제거했다.
- Vercel 배포 안내 문구와 관련 URL 참조도 추적 가능한 문서/소스 범위에서 제거했다.
- Railway 서비스 생성과 배포는 `Deploys have been paused temporarily` 오류로 차단되었다.
- 로컬 `docker compose up -d --build`는 Vercel 제거 후에도 성공했다.
