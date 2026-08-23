# 캔버스 휠 확대: 포인터 기준 앵커 줌

- 일시: 2026-07-06 05:06 (로컬)
- 브랜치: `feat/agent-note`
- 하위 프로젝트: `flownote/` (Vite React SPA)

## 문제

데스크톱에서 마우스 휠로 캔버스를 확대할 때 **world 원점(0,0) 기준으로만 확대/축소**되어, 커서가 가리키는 지점이 화면에서 벗어났다.

## 원인

`flownote/src/widgets/CanvasWidget/InfiniteCanvas/ui/Canvas.tsx`의 `handleWheel`이 `scale`만 변경하고 `offset`을 고정했다. 뷰포트 변환은 `screen = world * scale + offset`이라, offset이 고정되면 `world=0`이 항상 같은 화면 위치에 앵커되어 사실상 0,0 기준 줌이 된다.

## 수정

`handleWheel`을 터치 핀치줌(`moveViewportWithTouchGesture`)과 동일한 포인터 앵커 공식으로 변경. 초점은 커서 좌표(캔버스 픽셀 공간, `getCanvasViewportPoint`).

```
zoomRatio = nextScale / previousScale
nextOffset.x = focus.x - (focus.x - offset.x) * zoomRatio
nextOffset.y = focus.y - (focus.y - offset.y) * zoomRatio
```

- 스케일은 기존과 동일하게 `[0.2, 5]`로 클램프. 한계 도달로 `zoomRatio === 1`이면 위치 이동 없이 조기 반환.
- `scaleRef`/`offsetRef`와 `setScale`/`setOffset`을 함께 갱신(기존 뷰포트 저장/렌더 파이프라인과 일관).
- 커서 지점의 world 좌표가 확대 후에도 커서 아래에 유지된다.

## 검증

- `flownote`: `yarn build` 성공(11.5s, 4081 modules). 기존 청크 크기 경고만 존재(비오류).
- Docker: `REDIS_HOST_PORT=6380 docker compose up -d --build react-app` — react-app 재빌드·기동 정상(호스트 6379 충돌 우회).
- 클라우드: `flownote/`에서 `vercel --prod --yes` → Vercel production 배포.
  - deployment id: `dpl_A9PaJNWceXE1qcBkiLwnnGgSkaeg`, target production, readyState READY.
  - 배포 URL: https://flownote-react-8vbulw72y-flownote-service.vercel.app
  - alias: https://flownote-react.vercel.app → **HTTP 200** 확인.

## 배포 범위

`flownote/`만 변경 → **Vercel production만 배포**. FastAPI/Spring 변경 없음 → Railway(`flownote-api`/`flownote-main`) 배포 생략(실행 산출물 무변경).
