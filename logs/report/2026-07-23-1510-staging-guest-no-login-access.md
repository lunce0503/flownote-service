# 스테이징 로그인 없이 접근 — 게스트 자동 로그인 (env 게이팅)

작성 2026-07-23 15:10 UTC. 브랜치 `feat/diary`, 커밋 `e671811`. 스테이징에서만 로그인 없이 접근 가능하도록 변경. **프로덕션 보안·백엔드 인증 코드는 불변.**

## 방식

백엔드 인증을 우회하지 않는다(프로덕션 보안 유지). 대신 **스테이징 프론트에서만 게스트 계정으로 자동 로그인**해 실제 토큰을 발급받는다. 그러면 로그인 화면 없이 보호 라우트와 API가 모두 정상 동작한다.

- 게이팅: 빌드 타임 `VITE_ALLOW_ANONYMOUS === "true"` 그리고 `VITE_GUEST_EMAIL`/`VITE_GUEST_PASSWORD`가 있을 때만 활성(`guestConfigured`). 프로덕션 빌드는 이 값들을 설정하지 않으므로 `anonymousEnabled=false` → 기존 동작과 100% 동일.
- 구현(`flownote/src/features/auth/model/AuthContext.tsx`):
  - `bootstrapping` 상태: 스테이징 + 미인증일 때 자식 렌더를 잠깐 보류("게스트로 접속 중…" 로더)해 `ProtectedRoute`가 `/login`으로 순간 리다이렉트하는 것을 방지.
  - 마운트 시 `POST /api/users/login`을 게스트 자격으로 호출 → 성공 시 토큰/유저 저장. **콜드스타트(잠든 인증 서버 5xx) 대비 최대 4회 재시도**(1.5s 간격). 4xx(자격 오류)는 재시도 안 함.
  - 401 인터셉터: 게스트 모드에서는 `/login` 막다른 화면 대신 게스트 재로그인(`setBootstrapping(true)`)으로 처리.
- 백엔드 변경 없음. 게이트웨이/serve/Spring 인증 미들웨어 그대로.

## 게스트 계정 (스테이징 DB)

`POST /api/users`로 스테이징에 게스트 사용자 시드:
- email `guest@flownote-staging.local`, role `USER`(일반 권한), id `bcc6b898-…`.
- 로그인 검증: `POST /api/users/login` → 200, 토큰 발급 확인.
- 자격값은 저장소 소스에 두지 않고 Vercel 스테이징 프로젝트 env로만 관리(빌드 시 번들에 인라인 — 공개 스테이징 접근이 목적이므로 의도된 노출, 저권한·스테이징 한정).

## 배포 / 검증

- Vercel `flownote-react-staging`에 env 설정: `VITE_ALLOW_ANONYMOUS=true`, `VITE_GUEST_EMAIL`, `VITE_GUEST_PASSWORD` → `vercel --prod` 재빌드(빌드 타임 주입).
- `yarn build` ✓. 변경 파일 lint: 신규 이슈 없음(남은 `react-refresh/only-export-components`는 기존 `export { AuthProvider, useAuth }` 라인의 사전 존재 에러 — diff에서 해당 export 라인 미변경 확인).
- **번들 대조 검증**:
  - 스테이징 번들: `guest@flownote-staging.local`(1), `게스트로 접속`(1) 포함 → 게스트 자동 로그인 활성.
  - 프로덕션 번들: 게스트 이메일 0, `게스트로 접속` 0 → **프로덕션 무누수**.
- 게스트 로그인 200 + diary API(토큰으로 CRUD) 이미 실증 → 로그인 없이 앱 전체 동작.
- Docker 통합 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` **성공(exit 0)**, react-app 등 기동. `ai-server`만 사전 존재 `uvicorn: not found`(이번 변경은 프론트 AuthContext 1파일뿐, 무관).

## 되돌리기 / 프로덕션 안전

- 스테이징에서 다시 로그인 강제로 되돌리려면 `flownote-react-staging`의 `VITE_ALLOW_ANONYMOUS`를 제거하고 재배포하면 된다(코드 변경 불필요).
- 프로덕션(`flownote-react`)은 해당 env가 없어 영향 없음. 이 기능이 프로덕션으로 새려면 프로덕션 프로젝트에 명시적으로 env를 설정해야만 하므로 사고성 노출 위험이 낮다.

진입점: https://flownote-react-staging.vercel.app (로그인 없이 자동 접속) — 예: `/diary`.
