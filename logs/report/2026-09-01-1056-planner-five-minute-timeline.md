# 플래너 5분 단위 타임라인 및 문서 제목 배포 결과

## 작업 범위

- `feat/schedule-period-list`의 주간 일정 다중 기간 기능을 `main`에 병합했다.
- 주간 일정의 기간 생성 및 수정 시간을 5분 단위로 제한했다.
- 오늘 시간표를 00:00부터 24:00까지의 5분 셀로 변경하고 시간 축에 00:00부터 23:00까지 표시했다.
- 펜 도구, 필기 되돌리기, 필기 전체 삭제를 제거하고 칠하기 동작 단위 되돌리기를 추가했다.
- 기존 06:00~24:00, 10분 단위 일기 데이터를 새 24시간, 5분 단위 그리드로 변환해 보존하도록 마이그레이션했다.
- 브라우저 문서 제목을 기능과 현재 문서/날짜를 조합한 형식으로 변경했다.

## Git 반영

- 기능 브랜치 커밋: `90001bb feat(planner): add multi-period weekly schedules`
- `main` 병합 커밋: `3b4763b merge: integrate schedule period list`
- 후속 기능 커밋: `faf2b00 feat(web): refine planner timeline and document titles`
- 위 커밋은 모두 원격 저장소에 push했다.

## 검증 결과

- `flownote/` 대상 ESLint: 통과
- `yarn typecheck`: 통과
- `yarn lint`: 통과
- `yarn build`: 통과, Vite에서 4,147개 모듈 변환
- Playwright 전체 테스트: 19개 통과
- 문서 제목, 주간 일정 5분 간격, 24시간 시간표, 레거시 데이터 변환, 칠하기 되돌리기를 E2E로 확인했다.
- 공유 mock 서버의 전역 시나리오로 인한 병렬 실행 경합을 확인해 Playwright를 단일 worker로 고정했다.

## Docker 통합 검증

- 저장소 루트에서 `REDIS_HOST_PORT=6380 docker compose up -d --build` 실행: 성공
- DB, Redis, Ollama health check: 정상
- React, FastAPI, Spring, Canvas, Serve, AI HTTP 응답: 정상
- Expo mobile은 최초 번들 생성 중 10초 요청이 timeout됐으나 번들 완료 후 재검증에서 HTTP 200을 반환했다.

## 클라우드 배포

- Vercel production deployment: `dpl_DDGAce3oxa8DACMD8SpwaBUt73QP`
- 배포 URL: `https://flownote-react-o1xiwcuwj-flownote-service.vercel.app`
- production alias: `https://flownote-react.vercel.app`
- 배포 상태: `Ready`
- production alias HTTP 확인: 200
- 이번 변경은 `flownote/`만 수정했으며 백엔드 API 계약과 실행 산출물은 바뀌지 않아 Railway 서비스는 재배포하지 않았다.

## 롤백 기준

- UI 또는 데이터 변환 회귀가 발견되면 Vercel에서 직전 정상 deployment를 production으로 승격한다.
- 소스 롤백이 필요하면 `faf2b00`과 병합 커밋의 변경 범위를 검토한 뒤 새 revert 커밋으로 되돌린다. 기존 사용자 변경과 이력을 보존하기 위해 강제 reset은 사용하지 않는다.
