# 에이전트 노트 API (Ollama 기반 · 내부망 전용)

- 작성일: 2026-07-06, 갱신일: 2026-08-21
- 위치: `flownote-ai` (`/api/agent-note`), 외부 진입점은 `flownote-API` 게이트웨이
- 전제: **내부망 전용 · 클라우드 미배포.** Ollama(`gemma4:e2b-it-qat` + `embeddinggemma`)는 compose 네트워크의 `ollama:11434`로만 접근하며 호스트 포트를 노출하지 않는다.
- 관련 문서: [gemma4-e2b-ollama.md](./gemma4-e2b-ollama.md), [gemma4-e2b-ollama-usage.md](./gemma4-e2b-ollama-usage.md)

## 개념

그림판(캔버스) 이미지를 **텍스트 캡션으로 인덱싱**해 유사 이미지를 검색한다.

```
[그림판 이미지] --(gemma4 멀티모달)--> [한국어 캡션] --(embeddinggemma)--> [임베딩 벡터]
                                                                        │
[질의 이미지/텍스트] --(동일 파이프라인)--> [질의 임베딩] --코사인 유사도--> [top-k 결과]
```

- gemma4:e2b 는 이미지→텍스트만 가능(이미지 임베딩 벡터 없음). 그래서 **캡션을 텍스트 임베딩**해 검색한다.
- 인덱스는 flownote-ai 전용 sqlite 테이블 `agent_note_index`에 저장한다. 기능 요청은 Bearer 세션을 Core API로 검증하고 저장 키를 `userId:roomId`로 구성해 사용자와 방 단위로 격리한다. 최종 캔버스 원본 데이터는 여전히 Spring Core API 소유다.

## 환경 변수 (docker-compose `ai-server`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AGENT_NOTE_ENABLED` | `false` | 내부망 기능 활성화. Compose는 `true`, Railway는 비활성 |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | 내부망 Ollama 주소 |
| `OLLAMA_CHAT_MODEL` | `gemma4:e2b-it-qat` | 캡션(멀티모달) 모델 |
| `OLLAMA_EMBED_MODEL` | `embeddinggemma` | 임베딩 모델 |
| `OLLAMA_TIMEOUT` | `180` | CPU 추론 지연 대비(초) |
| `AGENT_NOTE_DB_PATH` | `/app/data/agent_note.db` | sqlite 인덱스 경로(named volume `agent-note-data`로 영속화) |

## 엔드포인트

내부망 접근 주소는 `http://192.168.0.18:8000` 또는 `http://localhost:8000`.
이미지 필드는 순수 base64 또는 `data:image/png;base64,...` data URI 모두 허용한다.
`index`, `query`, `ask` 요청에는 로그인으로 받은 `Authorization: Bearer <token>` 헤더가 필요하다.

### GET `/api/agent-note/health`
Ollama 도달·로드 모델·인덱스 건수 확인.
```bash
curl -s http://192.168.0.18:8000/api/agent-note/health
# {"ollama":"up","models":["embeddinggemma:latest","gemma4:e2b-it-qat"],"indexed":3}
```

### POST `/api/agent-note/index`
그림판 이미지를 캡션·임베딩해 인덱스에 저장.
```bash
curl -s http://192.168.0.18:8000/api/agent-note/index \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"room-1","image":"<base64|dataURI>","imageRef":"stroke-42"}'
# {"caption":"...", "entry":{"id":"...","room_id":"room-1","image_ref":"stroke-42",...}}
```

### POST `/api/agent-note/query`
질의 이미지(또는 텍스트)로 유사 이미지 top-k 검색. `image` 우선, 없으면 `text`.
```bash
curl -s http://192.168.0.18:8000/api/agent-note/query \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"room-1","image":"<base64|dataURI>","k":3}'
# {"query_kind":"image","query_caption":"...","matches":[{"score":0.69,"image_ref":"...","caption":"..."}]}
```

### POST `/api/agent-note/ask`
gemma4 에게 `search_similar_images` 툴을 주고 에이전트 응답 생성(이미지/질문 기반).
```bash
curl -s http://192.168.0.18:8000/api/agent-note/ask \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"roomId":"room-1","question":"이 그림과 비슷한 게 있어?","image":"<base64|dataURI>","k":3}'
# {"answer":"...", "tool_runs":[{"query_text":"...","matches":[...]}]}
```

## 최초 준비 (모델 pull)

```bash
docker compose exec ollama ollama pull gemma4:e2b-it-qat
docker compose exec ollama ollama pull embeddinggemma
```

## 알려진 한계

- **CPU 추론**이라 첫 요청은 모델 로딩 지연(수 초~십수 초), 이후 캡션/임베딩 각각 수 초.
- gemma4:e2b(양자화 소형 모델)는 **단순·합성 도형에서 캡션 노이즈**가 있다(형태·색을 혼동하거나 없는 텍스트를 지어내기도 함). 캡션 프롬프트에 "없는 글자/숫자를 지어내지 말라"를 넣어 완화했으나, 검색 품질은 캡션 문장 표현에 민감하다. 실제 필기·도형은 특징이 풍부해 합성 토이 케이스보다 분별력이 높다.
- 현재 세션 소유자와 `roomId` 조합으로 인덱스를 격리한다. 별도의 캔버스 멤버십 정책이 도입되면 Core API 권한 계약에 맞춰 추가 검증이 필요하다.
