# 사용자 피드백 DB 적재 (설정 화면 → flownote-serve)

작성 2026-07-28 16:14 UTC. 브랜치 `worktree-planner-integration`, 커밋 `e4d7ffc`.

## 문제

설정 화면의 "사용자 피드백" 창구가 **localStorage(`flownote_user_feedback`)에만 저장**되고 있었다(`flownote/src/pages/SettingsPage/index.tsx`). 즉 사용자가 피드백을 보내도 서버로 전달되지 않아 실제로는 접수되지 않았고, 브라우저 저장소를 비우면 사라졌다.

## 구현

**백엔드 — flownote-serve에 `feedback` 도메인 신설** (`internal/feedback/feedback.go`, diary와 동일 패턴)

| 엔드포인트 | 설명 |
| --- | --- |
| `POST /api/feedback` | 피드백 저장(본인) |
| `GET /api/feedback` | 내가 보낸 피드백 최신 50건 |
| `GET /api/feedback/all` | **관리자 전용** 전체 조회(최신 200건, `user_id` 포함) |

- 테이블 `user_feedback(id, user_id, category, message, contact, status, created_at)` + `(user_id, created_at DESC)` 인덱스. flownote-serve에 마이그레이션 러너가 없어 **시작 시 `CREATE TABLE IF NOT EXISTS`로 보장**(diary와 동일 방식).
- 입력 방어: 트림 후 길이 제한(category 40 / message 4000 / contact 200), 빈 내용은 400.
- 권한: 조회는 `user_id` 스코프로 본인 것만. 전체 조회는 `AdminMiddleware`.
- 파라미터화 쿼리만 사용(문자열 연결 SQL 없음).

**게이트웨이** — `_SERVE_PREFIXES`에 `feedback` 추가 → `/api/feedback/**`가 flownote-serve로 라우팅.

**프론트** — `entities/feedback`(타입 + `postFeedback`/`listMyFeedback`/`listAllFeedback`) 추가. 설정 화면이 API로 전송하며 **보내는 중 / 전송됨 / 실패** 상태를 명시하고, **"내가 보낸 피드백"** 목록(카테고리·시각·상태·내용)을 서버에서 불러와 표시한다. 미사용 localStorage 키 제거.

## 검증

- flownote-serve **Docker Go 빌드 성공**(로컬 Go 툴체인 부재 → 이미지 빌드로 컴파일 확인)
- 프론트 `yarn build` 통과, 변경 파일 `eslint` 클린
- 프로덕션 번들 확인: `/api/feedback` 호출 2건, `피드백 보내기`·`내가 보낸 피드백`·`전송에 실패` 문자열 포함, 구 `flownote_user_feedback` 키 **0건**
- **프로덕션 API end-to-end**(신규 계정 생성 → 로그인 → 피드백):
  1. `POST /api/feedback` → **201**, 저장된 행 반환(id/status=NEW/created_at)
  2. `GET /api/feedback` → **200**, 1건 조회(카테고리·내용·상태 일치) — DB 영속 확인
  3. 빈 내용 → **400** `피드백 내용을 입력해 주세요.`
  4. 비인증 조회 → **401**
  5. 일반 사용자의 `/api/feedback/all` → **403**(관리자 전용 차단)
- **프로덕션 DB 직접 확인**: `user_feedback` 테이블 생성됨(`id, user_id, category, message, contact, status, created_at`), 방금 전송한 행이 실제로 적재됨

## 배포

| 대상 | 결과 |
| --- | --- |
| Vercel `flownote-react` (production) | READY · https://flownote-react.vercel.app (피드백 UI + 관리자 화면) |
| Railway `flownote-serve` (production) | SUCCESS (빌드 ~25분 소요, Railway 빌더 지연) |
| Railway `flownote-api` 게이트웨이 (production) | SUCCESS |

- Docker 통합 빌드(`docker compose up -d --build`)는 **생략**: 워크트리에서 compose를 올리면 `container_name`이 사용자의 실행 중인 로컬 스택과 충돌한다. 대신 flownote-serve 이미지를 직접 빌드해 Go 컴파일을 검증했다.

## 관리자 화면 (커밋 `0198753`)

`/admin/feedback` 신설 — 기존 `/admin/canvas`와 동일 패턴(라우터에 화면 구현, `role !== "ADMIN"`이면 홈으로 리다이렉트).

- 카테고리별 접수 건수 요약, 분류 필터, 내용·연락처 검색
- 데스크톱은 표, 모바일은 카드(반응형), loading/error/empty 상태 명시, 새로고침
- 헤더 관리자 메뉴에 "피드백 관리" 링크 추가
- 데이터 출처: `GET /api/feedback/all`(AdminMiddleware)

**권한 검증(프로덕션 실증)**
- 비인증 → **401**
- 일반 사용자 → **403**
- 관리자 → **200**, 2건 조회 및 `user_id` 포함 확인(`ListAll` 스캔 정상). 검증에는 QA 테스트 계정을 일시적으로 ADMIN으로 올린 뒤 **즉시 USER로 원복**했다(실사용자 계정 무변경).
- 프론트 번들: `/admin/feedback`(3), `/api/feedback/all`(1), `피드백 관리`(2) 포함, 라우트 200

## 후속 여지

- `status` 값(NEW/…) 변경 API — 접수/처리중/완료 workflow가 필요해지면 추가.

## 스테이징 동기화 + main 병합 (2026-07-28 16:40 UTC)

**스테이징 동기화 배포** — 플래너 후속 4개 커밋을 모두 반영.
- Railway `flownote-serve` / `flownote-api` (staging) SUCCESS
- Vercel `flownote-react-staging` READY
- 검증: 게스트(일반) 로그인 → `POST /api/feedback` **201**, `GET /api/feedback` **200**, `/api/feedback/all` **403**;
  관리자 계정 → `/api/feedback/all` **200**(1건, `user_id` 포함). `/`·`/planner`·`/settings`·`/admin/feedback` 모두 200.
- 프론트 번들 지표가 프로덕션과 동일(planner=1, feedback=3, admin=2) → 두 환경 동기화 확인.

**PR #2 병합** — draft 해제 후 병합. `origin/main` `cdc3528` → `646b44b`(merge commit).
포함 커밋: `f356e19`(플래너 통합), `9145ef3`(할일 이름 수정·높이 정렬), `e4d7ffc`(피드백 DB), `0198753`(관리자 화면).
이제 **main == 프로덕션 배포 코드**로 일치한다.

**프로덕션 회귀 없음**: `/`·`/planner`·`/settings`·`/admin/feedback` 200, 게이트웨이 `{"status":"UP"}`.
