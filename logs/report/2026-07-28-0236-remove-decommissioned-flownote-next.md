# 폐기된 flownote-next 제거

작성 2026-07-28 02:36 UTC. 브랜치 `feat/diary`. 사용 여부 확인 후 미사용으로 판정, 제거.

## 사용 여부 판정: 쓰이지 않음

- **Vercel `flownote-next` 프로젝트가 이미 삭제됨** — `vercel project ls`에 `flownote-react`/`flownote-react-staging`만 존재. 로컬 `flownote-next/.vercel` 링크(`prj_ugp5…`)로 조회 시 "삭제/이관되었거나 접근 불가", "No deployments".
- 도메인 `https://flownote-next.vercel.app` → **404**(`/`, `/api/sync/events` 모두). 즉 프로덕션에서 **동작하는 기능이 전혀 없음**.
- 게이트웨이/다른 백엔드는 flownote-next로 라우팅하지 않음(프론트가 직접 호출하던 별도 Vercel BFF였음).
- 결론: `flownote-next/` 폴더는 **폐기된 서비스의 죽은 소스**. 사용자 지시("없다면 제거")에 따라 제거.

## 제거 내용

- **폴더 삭제**: `git rm -r flownote-next`(추적 파일 43개) + 잔여 아티팩트(node_modules/.next/.vercel, 총 881M) 정리.
- **docker-compose.yml**: `next-app` 서비스 블록 제거(다른 서비스가 `depends_on: next-app` 하지 않아 안전). `docker compose config` 파싱 정상, 잔여 참조 없음.
- **문서 정정**(System of Record):
  - `CLAUDE.md`: 하위 프로젝트 목록·명령에서 flownote-next 제거.
  - `ARCHITECTURE.md`: flownote-next 섹션 제거.
  - `docs/DESIGN.md`: 하위 프로젝트 표·검증 명령·compose 설명에서 제거.
  - `docs/FRONTEND.md`: 범위·빌드 명령에서 제거.
  - `docs/QUALITY_SCORE.md`: Next.js 품질 게이트 행 제거(과거 changelog 1건은 역사 기록으로 보존).
  - `docs/generated/db-schema.md`: "Prisma 스키마 반영" 문구 제거.
  - `docs/product-specs/mobile-was-architecture.md`: 웹 클라이언트 목록에서 제거.

## 검증

- `docker compose config -q` 통과, compose에 `next-app`/`flownote-next` 잔여 참조 0.
- 통합 Docker 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` **성공(exit 0)** — react·api·canvas·serve·spring·mobile 정상 기동. compose에서 서비스가 사라지면 이전 컨테이너가 고아로 남아, `docker rm -f flownote-next` + `docker compose up -d --remove-orphans` + `docker rmi service-next-app`으로 컨테이너·이미지까지 완전 제거 확인. (`ai-server`만 사전 존재 `uvicorn: not found`로 재시작 — flownote-next 무관.)
- 클라우드 배포: **불필요** — flownote-next의 클라우드 배포는 이미 삭제됨. 나머지 서비스의 런타임 코드는 변경하지 않음(문서·compose·폴더 제거뿐)이라 Vercel/Railway 재배포 대상 없음.

## ⚠️ 남은 dangling 참조(프론트) — 별도 결정 필요

`flownote-next/` 서버는 제거했지만, **프론트엔드 `flownote/`는 여전히 죽은 도메인을 가리키는 설정/코드**가 남아 있다(이미 404라 무해하지만 정리 대상):

- Vercel `flownote-react`(prod) env: `VITE_API_BASE_URL2 = https://flownote-next.vercel.app`, `VITE_SYNC_API_URL = https://flownote-next.vercel.app` (스테이징도 유사).
- `flownote/src/shared/lib/sync.ts`: `API_SYNC_BASE_URL`로 `/api/sync/publish`(POST)·`/api/sync/events`(SSE) 호출 → 크로스디바이스 sync 기능. 대상(next)이 사라져 **이미 비동작**.
- `flownote/src/shared/api/index.ts`: `API_BASE_URL2`(= next) 및 그 fallback.
- `docker-compose.yml` react-app 빌드인자 `VITE_API_BASE_URL2`/`VITE_SYNC_API_URL` 기본값 `:3000`(제거된 next-app 포트).

이들은 **프론트 기능(sync) 제거 결정**이 얽혀 있어 이번 폴더 제거 범위와 분리했다. sync 기능을 완전히 걷어낼지(코드+env 정리), 아니면 다른 백엔드로 재연결할지 알려주시면 후속 처리하겠다.

## git

- 변경: 폴더 43파일 삭제 + 문서/compose 8파일 수정. 커밋/푸시는 미실행(요청 시 진행).
