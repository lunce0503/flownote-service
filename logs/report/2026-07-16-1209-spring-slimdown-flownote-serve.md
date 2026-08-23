# Spring 인증 서버화 + flownote-serve 신설 + 게이트웨이 단일 진입점 + Redis 적용

- 일시: 2026-07-16 12:09 (로컬)
- 브랜치: `backend/spring-slimdown`(a2507cc) → `release/prod`(5ec7726, **배포 기준**) → `main`·`docs/harness` fast-forward, 전부 푸시
- 규모: 67개 파일 +3,953/−3,534 (Java 도메인 ~2,900줄 제거, Go ~3,400줄 신설)
- 동기: flownote-main(Spring)이 CPU 0.1%에 메모리 667MB 상시 점유 — 비용의 주범은 유휴 JVM

## 아키텍처 변경

```
프론트(VITE_CORE_API_URL) ──► flownote-api 게이트웨이 (단일 진입점, 상시 가동)
    /api/{canvas,notes,note-folders,upload,admin} · /uploads/** → flownote-canvas (Go, 필기 도메인)
    /api/{schedule-items,tasks,stocks,social,chat}              → flownote-serve (Go, 신설·서버리스)
    /api/{aiclient,agent-note,market}                            → flownote-ai (시세 Redis 캐시)
    그 외 (users·mobile)                                          → flownote-main (인증 전용·서버리스)
```

- **flownote-serve(Go, 신설)**: 일정·작업·주식·소셜·채팅 이관. jackson SNAKE_CASE 계약, 래퍼 키(`updatedScheduleItem`·`updatedTask` 등), S3 오프로드(메모·링크·타임로그·메시지), NUMERIC `::text` 정밀도 보존, SSE 시세 스트림, 합성 시세 폴백(Java hashCode 재현)까지 동작 보존. **공개 도메인 없음** — 게이트웨이 뒤에서 요청 시 웨이크.
- **flownote-canvas**: 노트 도메인 흡수(revision+client_id 낙관적 동시성 409, 본문 S3 키 규칙 nameUUIDFromBytes 재현, 폴더 uuid[], `/uploads` 정적).
- **flownote-main**: 인증 전용(auth·user·mobile·예외 처리)으로 축소, **App Sleeping ON**.
- **Redis(유휴→재활용)**: ① 세션 캐시 `session:{token}`→`userId|role` TTL 5분 — Go 공용 auth+Spring AuthService, 장애 시 DB 폴백(로컬 검증: 캐시 키·TTL 확인) ② flownote-ai 시세 캐시(quotes 5s·search 1h·history 10m) ③ 게이트웨이 socket.io Redis 매니저(REDIS_URL 게이트, replica 대비).
- 프론트 코드 무변경 — `VITE_CORE_API_URL`만 게이트웨이로 교체(빌드타임).

## 핵심 계약 발견

`spring.jackson.property-naming-strategy: SNAKE_CASE` — Spring의 모든 입출력이 snake_case였음. Go 포팅 초안(camelCase)을 전면 교정했고, flownote-ai 시세도 원래 snake라 패스스루 정합. **이관 시 application.yml의 전역 직렬화 설정을 반드시 먼저 확인할 것.**

## 검증

| 단계 | 결과 |
| --- | --- |
| 빌드 | gradlew test ✅ · Go 2서비스 docker 빌드 ✅ · pytest 12 ✅ (redis 의존성은 go.mod 1.23 호환 v9.7.3 고정, uv add) |
| 로컬 통합 | compose 11컨테이너(serve 추가) 기동 |
| 라우팅 매트릭스(로컬·프로덕션 동일) | 이관 8경로 401(백엔드 도달·인증 동작) · Spring 이관 라우트 404 · mobile/config 200 · /uploads 패스스루 |
| E2E(시드 사용자, 로컬) | 일정 생성(snake 응답)/PATCH 래퍼/삭제 · 작업 time_logs 정규화 · 채팅 CRUD·전체삭제 · 주식 현금 기본값 · 노트 목록 · **Redis `session:{token}` TTL 295s** |
| 프로덕션 배포 | canvas·serve·ai·api·main 전부 SUCCESS(서버리스 웨이크 포함 스모크 통과), Vercel `dpl_66cgD8zd…` READY 200 |

## Railway 구성 기록

- `flownote-serve`(id `df778cd1-…`): 변수 10개 — `${{Postgres.DATABASE_URL}}`, 스토리지 6종 `${{flownote-main.*}}` 참조, `REDIS_URL=redis://default:${{Redis.REDISPASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379`, 시세=게이트웨이 내부 경유. **App Sleeping ON**.
- `flownote-main`: App Sleeping ON. `flownote-api`: SERVE_API_BASE_URL+REDIS_URL. `flownote-canvas`·`flownote-ai`: REDIS_URL(+ai는 CORE→게이트웨이).

## 잔여·관찰 항목

- **메모리 절감 실측**: 며칠 뒤 metrics로 flownote-main 유휴 시간 비중과 청구 확인(항상 깨어 있으면 Sleeping 효과 없음 — 프론트 폴링 여부 관찰).
- 구버전 번들 기기는 Spring 직결이라 이관 라우트 404 — 캐시 새로고침 필수(기지 이슈).
- flownote-main의 스토리지 변수 6종은 이제 Spring이 안 읽지만 canvas/serve가 참조 원본으로 사용 중 — 이동 정리는 선택 과제.
- flownote-ai의 chat/social 라우터는 게이트웨이 라우팅 변경으로 미사용 코드가 됨 — 제거는 후속.
- Spring 업로드 volume(/mnt/storage/uploads)이 canvas 컨테이너로 이동 — 기존 업로드 파일은 로컬 마운트에 보존됨. Railway는 양쪽 다 ephemeral(기존과 동일).
