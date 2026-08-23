# Gemma 4 E2B (Ollama) 내부망 사용법

- 작성일: 2026-07-05 (검증 완료)
- 대상: `docker-compose.yml`의 `ollama` 내부 서비스에서 **GPU 없이(CPU)** Gemma 4 E2B를 테스트/사용하는 방법
- 모델: `gemma4:e2b-it-qat` (QAT int4, 4.3GB, CPU/제한 RAM 권장) — 모델 상세는 [gemma4-e2b-ollama.md](./gemma4-e2b-ollama.md)
- 전제: `ollama` 서비스는 **호스트 포트 미노출 · 클라우드 미배포**. 접근은 compose 네트워크 내부의 `ollama:11434`.

## 0. 서비스 상태 확인

```bash
docker compose up -d ollama          # 없으면 기동
docker compose ps ollama             # STATUS: Up (healthy), PORTS: 11434/tcp (호스트 매핑 없음)
```

## 1. 모델 받기 (최초 1회)

```bash
docker compose exec ollama ollama pull gemma4:e2b-it-qat
docker compose exec ollama ollama list   # gemma4:e2b-it-qat 가 뜨면 준비 완료
```

가중치는 named volume `ollama-models`에 캐시되어 컨테이너를 재생성해도 재다운로드하지 않는다.

## 2. 내부망 테스트 방법

> **주의**: `ollama/ollama` 이미지에는 `curl`이 없다. HTTP API 테스트는
> ① `ollama` **바이너리**로 하거나(`docker compose exec ollama ollama ...`),
> ② 같은 compose 네트워크에 붙은 **다른 컨테이너**(예: `curlimages/curl`)나 flownote 서비스에서 호출한다.

### 2-1. 컨테이너 안에서 바로 (가장 간단, curl 불필요)

```bash
docker compose exec ollama ollama run gemma4:e2b-it-qat "3 더하기 5는 얼마인지 숫자만 답해줘"
```

### 2-2. 네이티브 채팅 API (`/api/chat`, 다른 컨테이너에서 curl)

`--network service_default`로 compose 네트워크에 붙여 `ollama:11434`를 호출한다.
`"think": false`로 thinking 출력을 끄고, `num_predict`로 길이를 제한한다.

```bash
docker run --rm --network service_default curlimages/curl:latest \
  -s http://ollama:11434/api/chat -d '{
    "model": "gemma4:e2b-it-qat",
    "stream": false,
    "think": false,
    "messages": [
      { "role": "system", "content": "너는 간결한 한국어 도우미다." },
      { "role": "user", "content": "플로우노트를 한 문장으로 소개해줘" }
    ],
    "options": { "num_ctx": 4096, "num_predict": 80, "temperature": 1.0, "top_p": 0.95, "top_k": 64 }
  }'
```

### 2-3. 프롬프트 생성 API (`/api/generate`)

```bash
docker run --rm --network service_default curlimages/curl:latest \
  -s http://ollama:11434/api/generate -d '{
    "model": "gemma4:e2b-it-qat",
    "prompt": "1부터 5까지 세어줘",
    "stream": false,
    "think": false,
    "options": { "num_ctx": 4096, "num_predict": 40 }
  }'
```

### 2-4. OpenAI 호환 엔드포인트 (`/v1/chat/completions`)

```bash
docker run --rm --network service_default curlimages/curl:latest \
  -s http://ollama:11434/v1/chat/completions -d '{
    "model": "gemma4:e2b-it-qat",
    "messages": [{ "role": "user", "content": "hello" }]
  }'
```

### 2-5. 내부 DNS/도달 확인 (호스트 포트 없이 접근되는지)

```bash
docker run --rm --network service_default curlimages/curl:latest \
  -s http://ollama:11434/api/tags
```

> compose 네트워크 이름은 프로젝트 폴더 기준 `service_default`이다(`docker compose config`의 `networks.default.name`으로 확인). flownote-API·Spring 등 같은 네트워크 서비스는 모두 `http://ollama:11434`로 호출한다. 호스트 브라우저/터미널에서 직접 접근하려면 compose에 포트를 노출해야 하지만, 현재는 **내부 전용 정책상 노출하지 않는다**.

## 3. 요청 옵션 메모 (CPU)

- 권장 샘플링: `temperature=1.0`, `top_p=0.95`, `top_k=64`.
- **thinking 모드**: 이 모델은 기본으로 추론 과정을 먼저 출력한다. 간결한 응답이 필요하면 API에 `"think": false`를 준다.
- `num_ctx`: 128K 풀컨텍스트는 RAM을 크게 먹으므로 실제 필요치(예: 4096~8192)로 제한. `num_predict`로 출력 길이 제한.
- 첫 요청은 모델 로딩으로 지연이 크고, 이후 `OLLAMA_KEEP_ALIVE=1h` 동안 메모리에 유지된다.
- CPU 추론이라 토큰 생성 속도가 GPU 대비 느리다(내부 단일/소수 사용 전제).

## 4. flownote-API에서 호출 (다음 단계 참고)

무거운 ML 의존성은 ollama 컨테이너에만 두고, flownote-API는 얇은 HTTP 클라이언트로 호출한다.

```python
# 예시 (async httpx) — 베이스 URL은 환경변수로 주입 (예: OLLAMA_BASE_URL=http://ollama:11434)
import httpx

async def gemma_chat(messages: list[dict], base_url: str = "http://ollama:11434") -> str:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base_url}/api/chat",
            json={"model": "gemma4:e2b-it-qat", "stream": False, "think": False, "messages": messages},
        )
        r.raise_for_status()
        return r.json()["message"]["content"]
```

## 5. 검증 결과 (2026-07-05, GPU 없음/CPU)

- **모델 pull**: `gemma4:e2b-it-qat` 4.3GB 다운로드 성공, `ollama list`에 등록됨.
- **추론 (테스트 2-1)**: `ollama run ... "3 더하기 5는 ... 숫자만 답해줘"` → 최종 답 **`8`** (정답). CPU 첫 요청 약 17.5초(모델 로드 + thinking 포함). thinking 출력이 앞에 붙으므로 간결 응답은 `"think": false` 권장.
- **내부망 접근 (테스트 2-5)**: 별도 `curlimages/curl` 컨테이너를 `service_default` 네트워크에 붙여 `http://ollama:11434/api/tags` 호출 → `{"models":[{"name":"gemma4:e2b-it-qat",...}]}` 응답. **호스트 포트 없이 내부 DNS `ollama`로 도달 확인.**
- 결론: 내부망에서 Gemma 4 E2B 추론·API 접근 모두 정상.
