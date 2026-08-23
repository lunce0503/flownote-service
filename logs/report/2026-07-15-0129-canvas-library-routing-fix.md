# 캔버스 목록 로드 실패 수정 (이관 누락 배선)

- 일시: 2026-07-15 01:29 (로컬)
- 커밋: `0dbb3f3` (main·release/prod 정렬, 푸시 완료)
- 증상: 캔버스 목록(문서·폴더)이 로드되지 않음.

## 원인

Spring→Go 캔버스 이관(7/13, d62e4e1)에서 **누락된 마지막 프론트 배선**. `entities/canvas/api/canvasLibraryData.ts`의 문서·폴더 CRUD **10개 호출이 전부 `API_CORE_BASE_URL`(Spring)**을 향하고 있었고, Spring의 캔버스 라우트는 이관으로 제거되어 404 → 목록 로드 실패.

flownote-canvas(Go) 서버 자체는 문제 없음: documents/folders 10개 라우트와 응답 계약(snake_case `created_at/updated_at`, folders `canvasIds`)을 이미 완비 — 프론트 타입과 대조 검증 완료. **Go에 추가할 기능 없음.**

## 수정·잔재 정리

- `canvasLibraryData.ts`: 베이스 URL을 `VITE_CANVAS_API_URL`(Go, CORE 폴백)로 전환 — `usePersistence`(캔버스 HTTP)·`AdminCanvas`(관리자 진단)와 동일 패턴. 10개 호출 일괄 전환.
- 잔재/중복 전수 확인: 프론트에서 CORE URL로 가는 캔버스 호출 **0건**, Spring 소스의 `api/canvas` 코드 **0건** — 이관 잔재 없음(이번 파일이 유일한 누락이었음).

## 검증·배포

| 항목 | 결과 |
| --- | --- |
| `yarn build` · tsc · lint | 통과 · 32(기준선) · 84(기준선) |
| compose 통합 | 10개 컨테이너 Up, 로컬 Go `GET /api/canvas/documents` 401(라우트 정상, 인증 요구) |
| Vercel production | `dpl_CFt3YtJ55dUHF2Qfb7AY5e5jJsKx` READY, https://flownote-react.vercel.app 200 |
| 프로덕션 Go documents | 401(무토큰) — 라우트 서빙 확인 |
| Railway 배포 생략 사유 | 백엔드 파일 변경 없음(프론트 전용 수정) |

## 참고

- 브라우저에서 실제 목록 표시는 로그인 후 확인 필요(인증 필요 엔드포인트라 curl 스모크는 401까지가 한계).
- 구버전 번들 기기(어제 발견)는 이번 배포와 무관하게 캐시 삭제 필요 — 새 번들을 받으면 목록·소켓 모두 정상 경로로 복귀.
