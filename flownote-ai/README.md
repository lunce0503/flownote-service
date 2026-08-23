# flownote-ai

flownote-API(게이트웨이)에서 분리된 **AI/데이터 백엔드 전담 서비스**. FastAPI + uv.

## 엔드포인트

| 경로 | 기능 | 비고 |
| --- | --- | --- |
| `/api/aiclient` | 메인 에이전트(Gemini) 스트리밍 | 외부 Google Gemini API, `GEMINI_API_KEY` |
| `/api/agent-note` | 이미지 캡션→임베딩→유사 검색 | `AGENT_NOTE_ENABLED=true`인 내부망 Ollama 배포 전용. 비활성 환경은 health에 상태를 보고하고 기능 요청은 503 |
| `/api/market` | 주식 시세 | Spring이 `STOCK_MARKET_DATA_URL`로 소비 |
| `GET /api/capabilities` | Gemini·Ollama 기능 가용성 | 비밀값 없이 enabled/provider/scope만 반환 |
| `GET /` | 헬스체크 | `{"status":"UP","service":"flownote-ai"}` |

## 라우팅

클라이언트는 게이트웨이 `flownote-API`를 진입점으로 사용하고, 게이트웨이가 위 경로를
`AI_API_BASE_URL`(이 서비스)로 프록시한다. MCP 도구의 최종 저장은 `CORE_API_BASE_URL`의 게이트웨이를 거쳐 실제 도메인 소유 서비스로 전달된다. 채팅과 소셜의 외부 계약은 `flownote-serve`가 소유한다.

## 환경 변수

agent-note 기능 요청은 `Authorization` 세션을 Core API로 검증하고 인덱스를 `userId + roomId` 범위로 격리한다.

`GEMINI_API_KEY`, `CORE_API_BASE_URL`(게이트웨이), `AGENT_NOTE_ENABLED`, `OLLAMA_BASE_URL`(내부망, agent-note),
`AGENT_NOTE_DB_PATH`, `CORS_ORIGINS`, `PORT`.

Compose는 `AGENT_NOTE_ENABLED=true`를 기본 주입한다. Railway에는 Ollama가 없으므로 이 값을 설정하지 않는다.

## 로컬 실행

```bash
docker build -t flownote-ai:dev .
docker run --rm --network service_default -e PORT=8000 -p 8010:8000 flownote-ai:dev
```
