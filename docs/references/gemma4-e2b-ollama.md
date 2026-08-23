# Gemma 4 E2B (Ollama) 레퍼런스

- 조사일: 2026-07-05
- 목적: **내부망 전용** 로컬 추론 서버(GPU 없음 · CPU) 구성을 위한 모델 사양 조사
- 결론: CPU/제한 RAM 환경에는 **`gemma4:e2b-it-qat` (4.3GB)** 사용 권장. 클라우드 배포는 하지 않음.

## 1. 모델 개요 (Gemma 4 E2B)

- Google DeepMind 오픈 모델. `E` = **effective(유효) 파라미터**, 엣지/온디바이스 실행용 설계(노트북·모바일).
- 유효 파라미터 **2.3B** (임베딩 포함 시 5.1B).
- 컨텍스트 **128K** 토큰, 35 레이어, 슬라이딩 윈도우 512, 어휘 262K.
- **멀티모달**: 텍스트 + 이미지 입력 → 텍스트 출력. 추가로 오디오 인코더(~300M)로 오디오 입력 지원.
- **네이티브 function-calling**(도구 호출) 지원, `system` 역할 지원, thinking 모드(system 프롬프트의 `<|think|>` 토큰으로 트리거).
- 권장 샘플링: `temperature=1.0`, `top_p=0.95`, `top_k=64`. 멀티모달 입력은 이미지/오디오를 **텍스트 앞**에 배치.
- 3n과의 차이: 사용자가 지목한 것은 3n(E2B/E4B)이 아니라 **Gemma 4의 E2B** 태그. Ollama 라이브러리에 `gemma4:e2b`로 존재.

## 2. Ollama 태그/변형 크기

| 태그 | 크기 | 양자화/용도 |
| --- | --- | --- |
| `gemma4:e2b` (기본) | 7.2GB | Q4_K_M |
| **`gemma4:e2b-it-qat`** | **4.3GB** | **QAT int4 — CPU/제한 RAM 권장** |
| `gemma4:e2b-it-q4_K_M` | 7.2GB | Q4_K_M |
| `gemma4:e2b-it-q8_0` | 8.1GB | Q8 |
| `gemma4:e2b-it-bf16` | 10GB | bf16(원정밀) |
| `gemma4:e2b-mlx` | 6.5GB | MLX — **Apple Silicon 전용** |
| `gemma4:e2b-mlx-bf16` | 10GB | MLX bf16 — Apple 전용 |
| `gemma4:e2b-nvfp4` | 6.5GB | NVFP4 — **NVIDIA GPU 전용** |
| `gemma4:e2b-mxfp8` | 8.1GB | MXFP8 |

> **이 환경(GPU 없는 Linux CPU)**: `mlx*`(Apple 전용), `nvfp4`(NVIDIA GPU 전용)는 부적합. QAT(4.3GB)가 품질 대비 풋프린트 최소라 최우선. 기본 `gemma4:e2b`(7.2GB Q4_K_M)도 가능하나 더 무겁다.

## 3. GPU 없음(CPU) 실행 메모

- 받기: `ollama pull gemma4:e2b-it-qat`
- 실행 확인: `ollama run gemma4:e2b-it-qat`
- RAM: 모델 4.3GB + KV 캐시. **128K 풀컨텍스트는 RAM을 크게 먹으므로** 실제 필요치로 `num_ctx`(예: 4K~8K)를 제한 권장. 여유 RAM **최소 8GB** 권장(모델+컨텍스트+OS).
- 속도: CPU 추론은 GPU 대비 느림(코어 수에 비례). **내부망 단일/소수 사용** 전제에 적합.
- 네이티브 API: `POST http://<host>:11434/api/chat` `{ "model": "gemma4:e2b-it-qat", "messages": [...] }`
- OpenAI 호환: `POST http://<host>:11434/v1/chat/completions`

## 4. 내부망 서빙 계획 (클라우드 배포 안 함)

기존 스택(docker-compose + FastAPI) 재사용, **2계층**:

```
[flownote-API]  ──HTTP──▶  [ollama (내부 compose 서비스)]
 얇은 클라이언트              모델 로딩/추론 (CPU)
```

- Ollama를 `docker-compose.yml`에 **내부 서비스로만** 추가. 포트 publish/도메인 생성 X, Railway/Vercel 미배포.
- 컨테이너 내 바인딩 `OLLAMA_HOST=0.0.0.0`, 서비스 이름으로만 접근(예: `http://ollama:11434`).
- flownote-API가 얇은 클라이언트로 호출(무거운 ML 의존성은 Ollama 컨테이너에만 격리 → python 규칙 준수).
- 모델 가중치는 named volume(`ollama-models`)에 캐시해 재다운로드 방지.
- (선택) 개발머신 LAN 접근이 필요하면 Tier 2(LAN) 규칙에 맞춰 호스트 포트만 노출, 클라우드는 계속 제외.

## 5. 출처

- Ollama 라이브러리: https://ollama.com/library/gemma4:e2b
- Ollama 태그 목록: https://ollama.com/library/gemma4/tags
- Google — Ollama로 Gemma 실행: https://ai.google.dev/gemma/docs/integrations/ollama
- Hugging Face: https://huggingface.co/google/gemma-4-E2B-it
