# 일기장(diary) 기능 프로덕션 배포

작성 2026-07-24 14:58 UTC. 브랜치 `feat/diary`. 스테이징에서 검증한 다이어리 기능을 **프로덕션**(백엔드+프론트)에 배포.

## 배포 대상

기존 커밋(`a33e3b1` diary, `e671811` 게스트 자동 로그인)의 코드를 프로덕션 환경에 배포. 이번 턴에 소스 변경 없음(배포·검증만).

| 대상 | 배포 | 결과 |
| --- | --- | --- |
| flownote-serve (Railway production) | `railway up -e production` | SUCCESS — 시작 시 `diary_entries` 스키마 자동 생성 |
| flownote-api 게이트웨이 (Railway production) | `railway up -e production` | SUCCESS — `diary` 프리픽스 라우팅 |
| flownote-react (Vercel production) | `vercel --prod` | READY — https://flownote-react.vercel.app |

- CORS: 다이어리는 `/api/tasks`와 동일한 **게이트웨이→flownote-serve** 경로라 프로덕션 CORS는 이미 동작(별도 조정 불필요).
- flownote-main(Spring)은 재배포하지 않음(다이어리는 Spring 비의존).

## 검증

- **라우팅**: `GET /api/diary`(미인증) → `401 "로그인이 필요합니다"` — 게이트웨이가 serve로 정상 라우팅(404 아님).
- **스키마**: 프로덕션 DB에 `diary_entries` 존재, 컬럼 `id uuid, user_id uuid, entry_date date, todos/grid/journal jsonb, created_at/updated_at timestamptz`. `EnsureSchema`가 serve 기동 시 생성.
- **DB 스모크(무흔적)**: 프로덕션 DB에서 `BEGIN; INSERT(todos/grid/journal 실제 형태); SELECT; ROLLBACK;` → 삽입·조회 정상, 롤백 후 0 rows(영속 흔적 없음).
- **프론트**: 프로덕션 번들에 `일기장`(2)·`/api/diary`(2)·`오늘의 시간표`(1) 포함. `/`·`/diary` 200.
- **회귀/보안**: 프로덕션 로그인 정상 강제 — 잘못된 자격 → `401 "이메일 또는 비밀번호가 올바르지 않습니다"`(게스트 우회 아님).
- Docker 통합 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` **성공(exit 0)** — serve(diary)·api·react·spring·canvas 정상 기동. `ai-server`만 사전 존재 `uvicorn: not found`(diary 무관, flownote-ai 미변경). *(이번 턴은 소스 변경 없이 기존 커밋 배포라 참고용 검증.)*

## 게스트 자동 로그인 코드의 프로덕션 안전성

프론트를 `feat/diary`에서 배포하므로 게스트 자동 로그인 코드(`e671811`)가 프로덕션 번들에 포함되지만 **완전히 비활성**이다:
- 게이팅 `VITE_ALLOW_ANONYMOUS === "true"`가 프로덕션엔 미설정 → `anonymousEnabled=false` → 부트스트랩·자동 로그인 경로 미실행.
- 게스트 자격값(`VITE_GUEST_EMAIL/PASSWORD`) 미주입 → 번들에 게스트 이메일 **0건**(자격 노출 없음).
- 로더 문자열 `게스트로 접속`만 dead code로 1건 존재(동작 없음).
- 401 인터셉터는 프로덕션에서 기존대로 `/login` 리다이렉트(게스트 재로그인 경로는 `guestConfigured=false`라 미진입).

즉 프로덕션은 여전히 로그인을 요구하며, 게스트 모드가 켜지려면 프로덕션 프로젝트에 env를 **명시적으로** 설정해야만 한다.

## 참고 / 후속

- 코드는 `feat/diary` 브랜치에 있고 main 병합은 하지 않음(요청 범위 밖). 필요 시 병합 진행 가능.
- 프로덕션 다이어리 진입점: https://flownote-react.vercel.app/diary (로그인 후).
