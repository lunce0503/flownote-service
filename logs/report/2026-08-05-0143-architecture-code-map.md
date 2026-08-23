# Architecture 코드맵 갱신 결과

## 작업 범위

- 기준 브랜치/커밋: `main` / `cdc3528f29fc4fe6298dfd43ed45fe18df557b0f`
- 기존 작업 트리 변경 확인:
  - `flownote/tsconfig.app.json`: `ignoreDeprecations: "6.0"` 추가
  - `flownote/src/entities/canvas/model/types.ts`: 파일 끝 개행 제거, 타입 의미 변화 없음
- `ARCHITECTURE.md`에 현재 서비스 조감도, 프로젝트/파일 코드맵, API·Socket.IO·SSE 통신 맵, 데이터 소유권, 로컬·클라우드 실행 구성을 추가했다.
- 종료된 `flownote-next`를 현재 실행 대상에서 제외하고 `flownote-ai`, `flownote-canvas`, `flownote-serve`, diary 경로를 현재 코드 기준으로 반영했다.

## 검증

### 프론트엔드

- 명령: `cd flownote && yarn build`
- 결과: 성공, Vite 7.3.1에서 4,130개 모듈 빌드 완료
- 참고: 메인 JavaScript chunk가 500kB를 넘는 기존 경고가 있다.

### Docker Compose

- 명령: `docker compose up -d --build`
- 결과: 명령 exit code 0, 7개 애플리케이션 이미지 빌드 및 10개 Compose 서비스 기동
- HTTP 200 확인: React `5173`, gateway `8000`, Spring actuator `8080`, canvas `8090`, serve `8095`, mobile `8081`
- `db`, `redis`, `ollama` healthcheck는 healthy다.
- `ai-server`는 `Restarting (127)`이며 `8010` 연결이 실패했다.

AI 컨테이너 실패 원인은 `flownote-ai/.dockerignore` 부재다. Dockerfile의 `COPY . .`가 이미지 안 `/app/.venv`를 호스트 `.venv`로 덮어써 `/app/.venv/bin/uvicorn`의 shebang이 존재하지 않는 호스트 절대경로를 가리킨다. 상세 재현과 수정 방향은 `logs/bugs/2026-08-05-flownote-ai-docker-venv-overwrite.md`에 기록했다. 이번 요청은 코드맵 작성 범위이므로 백엔드 실행 코드는 수정하지 않았다.

## 클라우드 배포

### Vercel production

- 프로젝트: `flownote-react`
- deployment id: `dpl_6YD5Gj6peZVBBcJj7dHNrVPztxb5`
- 상태: `Ready`
- production URL: `https://flownote-react-htdy2hdhz-flownote-service.vercel.app`
- alias: `https://flownote-react.vercel.app`
- alias HTTP 확인: 200

### Railway production

백엔드 실행 코드와 설정은 수정하지 않았으므로 Railway 재배포는 생략했다. 읽기 전용 상태 확인 결과는 다음과 같다.

| 서비스 | deployment id | 상태 |
| --- | --- | --- |
| `flownote-api` | `384a43ae-f588-45d2-9ccb-473dffbbb143` | `SLEEPING` |
| `flownote-main` | `00ca5166-eb09-42a8-809c-70d78b82e6b8` | `SLEEPING` |
| `flownote-canvas` | `177552f4-689d-43d8-8f75-e70e8dfc7103` | `SUCCESS` |
| `flownote-serve` | `32cee5e8-43b0-46df-b2ea-a7968de2b177` | `SLEEPING` |
| `flownote-ai` | `67714d60-2788-457a-9777-5ecafaa242d9` | `SLEEPING` |

`SLEEPING`은 현재 Railway의 sleep application 설정에 따른 정지 상태이며 이번 작업에서 새 배포를 만들지 않았다.
