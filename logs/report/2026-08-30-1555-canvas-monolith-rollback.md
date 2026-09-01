# Canvas monolith rollback

## 배경

- `InfiniteCanvas/ui/Canvas.tsx`를 `ui/Canvas/` 아래 여러 컴포넌트와 훅으로 분리한 뒤 캔버스 진입 시 불러오기가 멈추는 것처럼 보인다는 운영 증상이 보고됐다.
- 원인 범위를 빠르게 축소하기 위해 분리 작업 자체를 되돌렸다.

## 변경

- 현재 브랜치의 분리 전 `Canvas.tsx` 733줄 구현을 그대로 복원했다.
- 분리 작업에서 추가한 `ui/Canvas/`의 11개 파일을 제거했다.
- 분리 작업 보고서 `2026-08-30-1347-canvas-component-split.md`를 제거했다.
- 캔버스 상태, 저장, 소켓 및 API 구현은 변경하지 않았다.

## 검증

- `yarn lint`: passed
- `yarn typecheck`: passed
- `yarn build`: passed
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: passed
- 로컬 React, FastAPI, Spring, Canvas health: HTTP 200
- 복원된 `Canvas.tsx`가 현재 브랜치의 분리 전 버전과 일치함을 확인했다.
- Vercel production deployment: `dpl_8HXsa1UwpU8B4Rd1Y7axrurasFth`
- Production alias: `https://flownote-react.vercel.app`
- 백엔드 소스 변경이 없어 Railway 재배포는 생략했다.
