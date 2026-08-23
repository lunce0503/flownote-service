# Spring→Go 캔버스 기능 완전 이관 (+ canvasId 로그)

- 일시: 2026-07-13 09:27 (로컬)
- 브랜치: `backend/canvas-go-migration`(9254890) → `release/prod`·`main`(d62e4e1), 전부 푸시
- 규모: 31개 파일 +206/−2,528 (Spring 캔버스 코드 2,300여 줄 제거)

## 이관 내용

**제거 (flownote-server)**: 캔버스 패키지 14개 클래스 + 테스트 4개 — 컨트롤러(257줄)·서비스(1,203줄)·Redis 요소 캐시·스토리지 아웃박스 워커/서비스·운영 스케줄러·진단 서비스/보존 잡·관리자 API·DTO·해셔. `application.yml` canvas 블록, compose 캔버스 캐시 env 제거.

**보존·이동**: 노트·채팅·소셜·작업·일정이 공유하던 S3 자산 헬퍼 `CanvasAssetStorage`(+시작 검증기)는 `com.flownote.storage`로 이동(사용처 5곳 + 테스트 1곳 import 갱신). 캔버스 테이블 Flyway 소유권은 Spring 유지(공유 DB 단일 소유 원칙).

**Go로 신규 이관 (flownote-canvas)**:
- 관리자 진단 `GET /api/admin/canvas/{summary,events}` — `RequireAdmin`/`AdminMiddleware` 신설(ADMIN 역할 검사, Spring과 동일 규칙), 프론트 `/admin/canvas` 화면의 응답 계약(snake_case 이벤트 필드, summary 구조) 유지. Go는 요청 큐가 없어 `requestQueue`는 0으로 응답.
- 진단 이벤트 30일 보존 잡(일 1회 고루틴) — Spring 크론 이관.
- 요청 로그에 쿼리스트링 포함(canvasId 추적 가능) — 직전 요청 사항.

**라우팅 전환**: 프론트 `/admin/canvas` → `VITE_CANVAS_API_URL`(Go). 로컬 compose도 프로덕션과 동일 구조로: `VITE_CANVAS_API_URL` 기본 :8090(Go), 게이트웨이 `CANVAS_API_BASE_URL=canvas-server:8090`, canvas-server CORS 허용.

## 검증

| 항목 | 결과 |
| --- | --- |
| `./gradlew test` (캔버스 제거 후) | BUILD SUCCESSFUL |
| Go docker 빌드 | 성공 |
| `yarn build` · tsc · lint | 통과 · 32(기준선) · 84(기준선) |
| compose 통합 | 10개 컨테이너 Up |
| 경계 스모크(로컬) | Spring `/api/canvas/load` 404·`/api/admin/canvas` 404 / schedule·notes 401(정상) / Go canvas·admin 401(인증 동작) |
| 프로덕션 | flownote-canvas SUCCESS(admin 401 확인) → Vercel `dpl_BPVdEjHU…` READY 200 → flownote-main SUCCESS(health UP, `/api/canvas/load` 404) — 무중단 순서 준수 |

## 후속 참고

- **Spring Redis 이제 미사용**(캔버스 캐시가 유일한 사용처였음) — 의존성·Railway Redis 제거 여부는 별도 결정 사항. actuator health에 Redis 지표가 남아 있어 급히 제거하지 않음.
- Railway `flownote-canvas`의 참조 변수 중 `FLOWNOTE_CANVAS_CACHE_*` 2개는 고아가 됨(무해, 정리 선택).
- Go 저장 경로는 `canvas_operation_events`를 기록하지 않음 — 관리자 이벤트 화면은 레거시 이벤트만 표시. Go에 이벤트 기록 추가는 선택 과제(tech-debt).
- `canvas_storage_jobs`는 레거시 테이블로 남음(Go는 인라인 저장). summary의 상태 집계는 레거시 현황 표시용.
