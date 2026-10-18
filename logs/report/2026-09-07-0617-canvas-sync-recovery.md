# 캔버스 저장 및 동기화 복구

## 요청과 범위

제거된 Next 동기화 호출, 소켓 메시지 크기 제한, 재연결 시 반복 저장 실패를 수정했다. 변경 대상은 React 웹과 FastAPI 게이트웨이이며 Go/Spring/AI의 도메인 저장 계약과 DB 스키마는 유지한다.

## 변경 사항

| 영역 | 구현 |
| --- | --- |
| 일반 동기화 | `shared/lib/sync.ts`가 게이트웨이 `/sync` Socket.IO namespace를 사용한다. Spring `/api/users/me`로 연결·발행 권한을 검증하고 사용자별 room으로 알린다. 연결 중 60초 간격 재검증, 재접속 시 전체 변경 조회 알림을 제공한다. |
| 제거된 환경 설정 | `VITE_SYNC_API_URL`을 앱에서 더 이상 읽지 않는다. Compose/Dockerfile 전달을 제거하고 Vercel production 변수도 삭제했다. |
| 큰 저장 | 요청이 900,000 UTF-8 bytes를 넘으면 `POST /api/canvas/save`로 전송한다. HTTP 요청 상한은 32MiB이며, HTTP와 소켓은 같은 `save_canvas` 함수와 mutationId/응답/변경 알림을 사용한다. |
| 소켓 보호 | 작은 저장만 소켓으로 보내고, 큰/오프라인 라인 미리보기를 버퍼링하지 않는다. 영속 저장 완료 알림으로 원격 상태를 복구한다. |
| 재시도 | 영구 실패와 `retryable:false`는 IndexedDB 큐의 blocked 상태로 남기며 자동 재시도를 중단한다. 재접속은 backoff를 초기화하지 않는다. 내용 변경과 수동 저장은 다시 시도할 수 있다. |
| 초안 보존 | 새로고침 시 초기화 전 cleanup/flush가 빈 상태로 초안을 지우던 경로를 차단했다. 초기 복원이 끝나기 전에는 저장/flush하지 않고 큐 복원도 기다린다. |
| 관측 | 저장 메시지 크기와 소켓 종료 사유를 기록한다. 문서 원문과 인증 값은 기록하지 않는다. 변경 알림 실패가 이미 성공한 저장을 실패로 바꾸지 않도록 했다. |

## 검증

- `flownote/`: `yarn lint`, `yarn build` 성공. build에 TypeScript 검증이 포함된다.
- `flownote-API/`: `uv run pytest -q`, 최종 24개 통과.
- 공식 Playwright 컨테이너: 전체 E2E 24개 통과, 재시도 없이 실행.
- 1MB 초과 HTTP 저장, 같은 mutation 재전송, 소켓 연결 유지, 32MiB 초과 전송 차단을 확인했다.
- 영구 실패 후 재접속/새로고침에서도 초안과 blocked 큐 보존, 수동 재시도, 내용 변경 후 새 mutation 저장을 확인했다.
- 일시적 실패의 backoff가 재접속 후에도 유지되는 것을 확인했다.
- 실제 Socket.IO 프로토콜 테스트와 브라우저 테스트로 기기 간 이벤트 전달, 사용자 room 격리, 인증 거부, 재연결 복구를 확인했다.
- 초기 E2E에서 드러난 초안 유실은 초기화 guard 추가 후 회귀 테스트가 통과했다. 상태 표시 선택자는 모바일/데스크톱 중 실제 표시된 요소를 검증하도록 정정했다.
- `git diff --check` 성공.
- 운영 점검 중 큰 비인증 HTTP 요청이 upstream의 조기 연결 종료로 502가 되던 경로를 발견했다. 본문 전달 전 세션을 검증하도록 보완하고 회귀 테스트와 Docker 검증을 다시 통과했다.

## Docker

- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 최초 및 최종 인증 보완 후 모두 exit 0.
- 전체 Compose 서비스 running. DB/Redis/Ollama healthy.
- 로컬 웹/API/Canvas/Serve 응답 정상, Spring health UP.
- 신규 HTTP 저장 경로는 인증 없는 요청에 401과 허용 origin CORS 헤더를 반환했다.

## 클라우드

- Railway API 최초 배포: `88be5eb3-b331-4cdd-9c64-90f742d0e507`, SUCCESS.
- Railway API 최종 인증 보완 배포: `e48c6edf-2106-445b-9d1c-edc9167eebf7`, SUCCESS.
- API 운영 URL: https://flownote-api-production.up.railway.app, `GET /` 응답 `status: UP`. `/health`는 이 서비스의 상태 경로가 아니며 404를 반환하므로 `/`로 확인했다.
- 최종 운영 스모크 테스트: 합성 무효 토큰으로 1,100,190 bytes 저장 요청을 보내 HTTP 401, React origin의 CORS 헤더, 기존 소켓 연결 유지를 확인했다. 실제 사용자 데이터는 쓰지 않았다.
- `/sync` namespace의 무효 인증 거부를 운영에서 확인했다. 최종 배포 CLI 로그에서는 Uvicorn 정상 기동과 루트 HTTP 200을 확인했다. 이 제한된 로그 범위로 운영 오류 전체의 부재를 단정하지 않는다.
- Vercel production 배포: `dpl_BQB79xdF6BEgcP5oZChxwgwuKD8g`, Ready.
- 웹 운영 URL: https://flownote-react.vercel.app, HTTP 200. 배포 URL: https://flownote-react-ghq27h1n1-flownote-service.vercel.app.
- 배포된 `sync-CPoF2Lyi.js`에서 `/sync` 사용과 이전 EventSource 및 `/api/sync/events` 호출 제거를 확인했다.
- 영향받지 않은 Railway Canvas/Main/Serve/AI는 재배포하지 않는다.

## 한계와 롤백

- 과거 실패한 실제 사용자 메시지의 크기는 당시 로그에 없어 그 요청의 직접 원인을 소급 확정할 수 없다. 운영의 1MB 제한과 같은 라이브러리의 크기 초과 끊김은 재현했다.
- 32MiB를 초과하는 단일 저장은 명시적으로 중단하며 사용자가 내용을 나눠야 한다. 초안은 유지한다.
- 동기화 알림은 영속 이벤트 이력이 아니므로 연결 복구 후 현재 데이터를 다시 조회한다.
- 인증된 실제 사용자 데이터의 운영 저장은 실행하지 않았다. 정상 저장, 사용자 격리, 초안 복원은 통합 테스트와 브라우저 E2E로 검증했다.
- API 롤백 기준은 이전 성공 배포 `d2abac4b-5a6f-41ac-ac3c-ea514a84b6ef`다. 새 웹은 신규 HTTP 저장 및 sync namespace에 의존하므로 API를 롤백할 때 웹도 직전 정상 배포로 함께 롤백해야 한다.
- 이번 작업은 `main`의 작업 트리에서 수행했으며 기존 사용자 미추적 문서는 건드리지 않았다.

## 소유 문서

- [아키텍처](../../ARCHITECTURE.md)
- [신뢰성 기준](../../docs/RELIABILITY.md)
- [제품 행동](../../docs/product-specs/canvas-save-recovery.md)
- [원인 기록](../bugs/2026-09-07-canvas-sync-disconnect.md)
