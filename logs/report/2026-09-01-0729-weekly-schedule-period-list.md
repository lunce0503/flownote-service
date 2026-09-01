# 주간 일정 기간 리스트 구현 및 배포

## 작업 범위

- 작업 브랜치: `feat/schedule-period-list`
- 기준 브랜치: `origin/docs/canvas-code-map` (`dae809e`)
- 기존 `feat/schedule`은 최신 플래너에서 제거된 `DailySchedulePanel`을 사용하고 있어 직접 배포하지 않았다.
- 기존 브랜치 초안은 `stash@{0}`의 `codex-obsolete-schedule-draft-2026-09-01`로 보존했다.

## 구현

- 주간 일정 생성 폼에 여러 요일·시간 구간을 추가·삭제할 수 있는 기간 리스트를 추가했다.
- 기간별 요일 선택, 시작 시간, 종료 시간을 독립적으로 관리한다.
- 공통 제목과 색상을 각 기간의 기존 `ScheduleItemInput`으로 변환해 순차 저장한다.
- 일부 기간 저장이 실패하면 같은 시도에서 생성된 일정 ID를 삭제해 부분 저장을 보상한다.
- 기존 일정 수정·삭제는 기존 단일 일정 API 계약을 유지한다.
- 사용자 흐름과 API 매핑은 `docs/product-specs/weekly-schedule-period-list.md`에 기록했다.

## 검증

- `flownote/yarn lint`: 통과
- `flownote/yarn build`: 통과, TypeScript와 Vite production build 포함
- `git diff --check`: 통과
- Playwright Docker E2E: 통과
  - 이미지: `mcr.microsoft.com/playwright:v1.62.1-noble`
  - 모바일 viewport: 390x844
  - 월요일 09:30~11:00, 수요일 14:00~16:30 두 기간의 UI 저장과 API payload 확인
- 호스트 Playwright는 기존 root 소유 Vite 캐시와 `libatk-1.0.so.0` 누락으로 실행할 수 없어 Docker에서 대체 검증했다.

## Docker

- 명령: `REDIS_HOST_PORT=6380 docker compose up -d --build`
- 결과: 9개 애플리케이션·인프라 서비스 이미지 빌드 및 전체 컨테이너 재기동 성공
- HTTP 확인: React 200, FastAPI docs 200, Spring actuator 200, Canvas 200, Serve 200, AI docs 200, Mobile 200
- FastAPI gateway에는 `/health` 라우트가 없어 해당 경로는 404이며 `/docs`와 기동 로그로 확인했다.
- 모바일 이미지의 `npm ci`에서 기존 의존성 감사 경고 34건이 출력됐다. 이번 프론트 변경과 직접 관련은 없다.

## 클라우드 배포

- Vercel project: `flownote-react`
- target/status: `production` / `Ready`
- deployment id: `dpl_HfjjGjtB9aKnQeFfb1Cy8N2BH4Lz`
- deployment URL: `https://flownote-react-2ql1f42jn-flownote-service.vercel.app`
- production alias: `https://flownote-react.vercel.app`
- production alias HTTP: 200
- Railway: 백엔드 소스, API 계약, DB 스키마 변경이 없어 재배포하지 않았다.

## 롤백

- Vercel에서 문제가 확인되면 직전 정상 deployment를 production으로 promote하거나 `vercel rollback`을 사용한다.
- 기간 리스트는 기존 API 요청 여러 건으로만 구현되어 프론트 롤백 시 별도 DB migration 복구가 필요하지 않다.
