# flownote-ai

flownote-API(게이트웨이)에서 분리된 **AI/데이터 백엔드 전담 서비스**. FastAPI + uv.

## 엔드포인트

| 경로 | 기능 | 비고 |
| --- | --- | --- |
| `/api/aiclient` | 메인 에이전트(Gemini) 스트리밍 | 외부 Google Gemini API, `GEMINI_API_KEY` |
| `/api/agent-note` | 이미지 캡션→임베딩→유사 검색 | **내부망 Ollama 전용**(`OLLAMA_BASE_URL`). 클라우드엔 Ollama가 없어 미동작 |
| `/api/market` | 주식 시세 | Spring이 `STOCK_MARKET_DATA_URL`로 소비 |
| `/api/chat` | 채팅 | |
| `/api/social` | 소셜 | |
| `GET /` | 헬스체크 | `{"status":"UP","service":"flownote-ai"}` |

## 라우팅

클라이언트는 게이트웨이 `flownote-API`를 진입점으로 사용하고, 게이트웨이가 위 경로를
`AI_API_BASE_URL`(이 서비스)로 프록시한다. MCP 도구의 최종 저장은 `CORE_API_BASE_URL`(Spring)을 거친다.

## 환경 변수

`GEMINI_API_KEY`, `CORE_API_BASE_URL`(Spring), `OLLAMA_BASE_URL`(내부망, agent-note),
`AGENT_NOTE_DB_PATH`, `CORS_ORIGINS`, `PORT`.

## 로컬 실행

```bash
docker build -t flownote-ai:dev .
docker run --rm --network service_default -e PORT=8000 -p 8010:8000 flownote-ai:dev
```
