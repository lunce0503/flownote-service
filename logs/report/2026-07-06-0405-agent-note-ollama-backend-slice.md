# 에이전트 노트 Ollama 백엔드 슬라이스

- 일시: 2026-07-06 04:05 (로컬)
- 브랜치: `feat/agent-note`
- 범위: flownote-API 에 그림판 이미지 → 캡션 → 임베딩 → 유사 검색 백엔드 추가 (내부망 전용, 클라우드 미배포)

## 배경 / 설계

사용자 요구: 그림판 제스처로 그린 영역을 이미지로 받아 gemma4 가 이해하고, 이미지 특성을 **텍스트로 인덱싱한 이미지 DB**에서 유사 이미지를 검색해 결과를 돌려주는 에이전트 노트.

- gemma4:e2b 는 이미지→텍스트만 가능(이미지 임베딩 없음) → **캡션→텍스트 임베딩(embeddinggemma)** 방식 채택.
- flownote-API 는 DB 계층이 없음(최종 데이터는 Spring 소유) → 보조 검색 인덱스는 **stdlib sqlite** 전용 테이블로, 새 DB 의존성(asyncpg/sqlmodel) 없이 구현. 운영 확장 시 pgvector 이관 경로.
- Gemini `AgentService` 와 분리된 별도 `OllamaAgentService`.

## 변경 파일

| 파일 | 내용 |
| --- | --- |
| `flownote-API/app/services/ollama_client.py` | 내부망 Ollama 호출 async httpx 클라이언트(chat/caption_image/embed/tags), data URI 정규화, `OllamaError` |
| `flownote-API/app/services/agent_note_store.py` | sqlite 인덱스 `agent_note_index` + 순수 파이썬 코사인 유사도, **지연 초기화**(import 시 FS 미접근) |
| `flownote-API/app/services/agent_note_service.py` | `OllamaAgentService`: index_image / query_by_image / query_by_text / ask(gemma4 `search_similar_images` 툴) / health |
| `flownote-API/app/api/agent_note_router.py` | `/api/agent-note` 라우터: `/index` `/query` `/ask` `/health`, pydantic 입력 검증 |
| `flownote-API/app/main.py` | agent_note_router 등록 |
| `docker-compose.yml` | api-server 에 `OLLAMA_BASE_URL`/`AGENT_NOTE_DB_PATH` env, `agent-note-data` 볼륨, `depends_on: ollama` |

## 검증 (CPU, 내부망)

- `py_compile` 전 파일 통과, `docker compose config` OK.
- `docker compose up -d --build` (repo 루트, `REDIS_HOST_PORT=6380`으로 호스트 6379 충돌 우회) — **전 서비스 기동**(db/redis/ollama/spring/api/next/react/mobile).
- `GET /api/agent-note/health` → `{"ollama":"up","models":["embeddinggemma:latest","gemma4:e2b-it-qat"],"indexed":3}` (api-server → `ollama:11434` 내부 도달 확인).
- 파이프라인: 도형 3장(빨강 원/파랑 사각형/녹색 삼각형) `/index` → 원형 질의 `/query`.
  - 인덱싱 캡션 정확(각 도형 색·형태 인식), 캡션당 5~6초.
  - 질의 캡션 그라운딩 확인("주황색 원이 흰색 바탕 위에 있습니다"). 캡션 프롬프트에 "없는 글자/숫자 지어내지 말 것" 추가로 초기 환각(존재하지 않는 숫자) 제거.
  - 코사인 랭킹 정상 동작. `red_circle` 은 top-2 로 근접(0.66 vs 0.69). 합성 토이 도형에서 소형 모델 캡션 노이즈로 1위가 뒤바뀌는 경우 존재 — 파이프라인 결함이 아니라 모델·짧은 문장 임베딩 민감도 한계.
- `agent-note-data` 볼륨으로 컨테이너 재생성 후에도 `indexed:3` 영속 확인(지연 초기화 정상).

## 클라우드 배포

**미실행(의도).** 사용자 지시 "클라우드로 배포는 하지 말아줘"에 따라 Ollama/에이전트 노트 슬라이스는 **내부망 전용**으로 유지한다. Railway 에는 ollama 서비스가 없어 `OLLAMA_BASE_URL` 미해결이며, agent-note 라우트는 지연 초기화로 앱 전체를 죽이지 않고 해당 라우트에서만 502 를 낸다. 배포가 필요해지면 별도 인프라(내부 GPU/CPU 노드) 결정 후 진행.

## 다음 단계 (후속)

1. 프론트: 캔버스 제스처 → 영역 크롭 → PNG base64 → `/query` → 결과 재렌더링/표시.
2. `canvas_socket` membership 인증을 agent-note 라우트에 연동(현재는 room 스코프만).
3. 커밋: `feat/agent-note` 로 신규 파일 + compose/main 변경 커밋(사용자 요청 시).
