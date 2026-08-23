# Railway + Vercel 프로덕션 배포 보고서

작성일: 2026-07-03 11:31
계획: `~/.claude/plans/tingly-singing-mccarthy.md` Part 3 (클라우드 배포)
선행: PR #1 main 병합(커밋 구조 정리 + 내부망), `report/2026-07-03-0346-commit-structure-and-deploy-prep.md`

## 요약

병합된 main을 프로덕션에 배포했다. Railway 2개(Spring, FastAPI) + Vercel 2개(Vite 웹, Next) **네 서비스 모두 배포·헬스체크 통과**. 캔버스 실시간 Socket.IO 핸드셰이크, 웹 빌드에 구워진 백엔드 URL까지 확인했다.

## 인증

- 비대화형 환경이라 `railway login`/`vercel login` 인터랙티브가 막혔으나, 사용자가 사전 로그인해 둔 상태를 확인: Railway CLI·MCP = `lunce0503@gmail.com`, Vercel CLI = `lunce0503-6042`. 두 Vercel 앱은 이미 링크됨(`.vercel/project.json`).

## 배포 결과 (production)

| 서비스 | 대상 | 방식 | 결과 |
| --- | --- | --- | --- |
| Spring | Railway `flownote-main` (프로젝트 `flownote`) | MCP deploy, path=`flownote-server` | SUCCESS. `GET /actuator/health` → 200 `{"status":"UP"}` |
| FastAPI | Railway `flownote-api` | MCP deploy, path=`flownote-API` | SUCCESS. `GET /` → 200. Socket.IO 핸드셰이크 200(`upgrades:["websocket"]`) |
| Vite 웹 | Vercel `flownote-react` | `vercel --prod` | READY. https://flownote-react.vercel.app → 200 |
| Next | Vercel `flownote-next` | `vercel --prod` | READY. https://flownote-next.vercel.app → 200 |

- Railway 빌드는 각 서브프로젝트 `railway.json`의 **DOCKERFILE 빌더**로 수행됨(대시보드 라벨은 RAILPACK이나 railway.json이 override). 업로드 스냅샷은 gitignore를 존중해 `.venv`/`build` 제외(Spring 116 kB).
- Spring 기동 로그: Flyway "Successfully validated 21 migrations", **"Current version: 20, No migration necessary"** → 프로덕션 DB는 이미 V20(note_revisions)까지 적용돼 있어 **스키마 변경 없음**. HikariPool→Postgres, Tomcat 8080, 5.3초 기동, 오류 없음.
- FastAPI: uvicorn이 Railway `PORT=8080` 존중(Dockerfile `${PORT}`), AgentService 초기화 정상(GEMINI_API_KEY 설정됨).

## 배선 확인

- `flownote-api.CORE_API_BASE_URL=http://flownote.railway.internal:8080` = `flownote-main`의 사설 도메인(`flownote.railway.internal`)과 일치. Spring→Postgres/Redis도 사설망(`postgres.railway.internal`, `redis.railway.internal`).
- 두 Railway 서비스 `CORS_ORIGINS=https://flownote-react.vercel.app,https://flownote-next.vercel.app` = 배포된 Vercel 별칭과 일치.
- Vercel `flownote-react` 빌드 JS 번들(`/assets/index-*.js`)에 `flownote-production.up.railway.app`·`flownote-api-production.up.railway.app` 모두 구워짐 확인 → env 실제 반영.
- **`VITE_CANVAS_SOCKET_URL`**: 기존 빈 값이었으나 프론트가 `VITE_API_BASE_URL`(=FastAPI URL)로 폴백해 동작 중이었음. 취약 의존 제거 위해 `https://flownote-api-production.up.railway.app`로 명시 설정(Vercel `env pull` 표시는 캐시 quirk로 빈 값처럼 보이나 항목은 단일·정상, 빌드 반영 확인됨).

## 남은 배선 갭 (기존부터 미설정, 이번에 안 건드림)

- **Spring `MOBILE_*` 변수 미설정**: `/api/mobile/config`가 기본값(localhost) 반환 → 모바일(Part 4) 진행 시 `MOBILE_CORE_API_URL`/`MOBILE_AI_API_URL`/`MOBILE_WEB_URL` 등을 프로덕션 URL로 설정 필요.
- **Spring `STOCK_MARKET_DATA_URL` 미설정**: 주식 시세(Spring→FastAPI market) 프로덕션 배선 필요 시 `http://flownote-api.railway.internal:8080/api/market`.

## 미검증 (권장: 브라우저 실사용)

- 로그인 플로우, 캔버스 실시간 협업(wss), 노트 저장 등 인증 필요한 end-to-end는 브라우저에서 실사용 확인 권장. 헬스체크·CORS·소켓 핸드셰이크·구워진 URL까지는 확인됨.

## 다음 단계 (Part 4 — 모바일)

- `! eas login`(Expo) → `eas init`(projectId) → `eas.json` placeholder URL을 `https://flownote-production.up.railway.app`로 교체 → `eas build -p android --profile preview`(APK). iOS는 Apple Developer 계정 확보 후.
- 모바일 실사용 전 위 `MOBILE_*` Railway 변수 설정 필요.
