# flownote-agent

## Flownote 연구 모듈

2026-10-14 `AI/flownote-agent`의 현재 소스·설정·테스트를 이 위치로 편입했다. 이후 개발은 `Flownote/service/research/flownote-agent`에서 진행하고, 단계·상태는 [편입 실행 계획](../../docs/exec-plan/active/2026-10-14-flownote-agent-integration.md)에서 관리한다.

학습·평가·모의 도구 실행용이며 운영 `flownote-ai`에는 아직 연결되지 않았다. requirements와 패키지 배치를 유지하고 GPU 의존성·가중치를 운영 API에 합치지 않는다. Git·가상환경·인증값·생성 데이터·모델은 복사하지 않았다.

아래는 편입한 기술 가이드다. 모델 사양·가격·데이터 조건은 실제 학습 전에 확인하며 테스트 수는 최신 실행 기록을 기준으로 한다. 실제 도구 연결은 [제품 사양](../../docs/product-specs/note-task-agent.md)을 따른다.

**Gemma 4 E2B** 기반 한/영 노트 에이전트를 QLoRA로 파인튜닝하는 저장소.
학습은 RunPod, 배포는 GGUF 로컬 실행 기준입니다.

수정된 구축 계획과 원본 기획서에서 무엇을 왜 바꿨는지는 **[docs/PLAN.md](docs/PLAN.md)**
에 있습니다. 먼저 읽으세요 — 특히 §0①(제어 토큰이 이미 네이티브라 아무것도 추가하지
않는다는 것)과 §1(학습을 실제로 깨뜨리는 함정 3개).

## 지금 바로 확인

GPU도 체크포인트 다운로드도 API 키도 필요 없습니다.

```bash
make venv
make test     # 87 tests — 값 문법, 파서, 손실 마스킹, 에이전트 루프, 데이터 변환기, 학습 준비
make seed     # 손으로 쓴 9개 예제를 실제 JSON Schema로 검증
```

`test_masking.py`와 `test_pipeline.py`는 **실제 Gemma 4 토크나이저**를 씁니다
(수 MB, 체크포인트 아님). 오프라인이면 자동으로 skip됩니다.

## Gemma 4 대화 포맷

에이전트 루프 전체가 **하나의 model 턴** 안에서 이어집니다. thought → 도구 호출 →
환경의 응답 → thought → 최종 답변이 전부 한 턴이고, `<turn|>`으로 닫힙니다.

```
<bos><|turn>system
<|think|>
너는 FlowNote의 노트 관리 에이전트다. ...
<|tool>declaration:search_notes{description:<|"|>Full-text and tag search...<|"|>,parameters:{...}}<tool|><turn|>
<|turn>user
배포 회의록 찾아줘<turn|>
<|turn>model
<|channel>thought
검색이 필요하다.
<channel|><|tool_call>call:search_notes{limit:5,query:<|"|>배포<|"|>}<tool_call|><|tool_response>response:search_notes{count:1,title:<|"|>주간 standup<|"|>}<tool_response|><|channel>thought
찾았다.
<channel|>1건 찾았습니다.<turn|>
```

제어 토큰 12개는 **전부 단일 토큰**이라 토크나이저에 아무것도 추가하지 않습니다
(`make tokenizer`로 실측 확인). 인자는 JSON이 아니라 `<|"|>` 구분자를 쓰는 Gemma 4
자체 문법이고, `protocol.py`가 인코더/파서를 함께 갖고 있습니다.

렌더링은 **공식 chat template**(`apply_chat_template`)을 그대로 씁니다. Google이
2026-07-09에 tool-calling loop / turn closure 수정본을 냈고, 손으로 재구현하면
반드시 어긋납니다. 우리가 직접 쓰는 건 파서뿐입니다.

**손실**은 model이 실제로 생성하는 토큰만 계산합니다 — 두 thought, 도구 호출,
최종 답변, 그리고 정지 신호인 `<|tool_response>`와 `<turn|>`. 그 사이의
`response:...<tool_response|>`(환경이 쓴 텍스트)는 마스킹합니다.

## 구조

| 경로 | 역할 |
| :--- | :--- |
| `src/flownote_agent/protocol.py` | **인코딩·파싱·손실 마스킹의 단일 진실 공급원** |
| `src/flownote_agent/tools.py` | 도구 레지스트리, JSON Schema로 인자 검증 |
| `configs/tools/flownote_tools.json` | FlowNote 도구 14개 — 데이터 생성·평가·런타임이 모두 이 파일을 봅니다 |
| `src/flownote_agent/data/converters.py` | xLAM / Glaive / ShareGPT / Alpaca / Magicoder → 내부 포맷 |
| `src/flownote_agent/data/synth.py` | 교사 모델로 FlowNote 특화 대화 생성 (7가지 시나리오) |
| `src/flownote_agent/data/build_dataset.py` | 믹스 비율 + 언어 밸런싱 + train/eval 분할 |
| `src/flownote_agent/train/sft.py` | QLoRA SFT. `mm_token_type_ids`, LoRA 스코핑, `use_cache` 처리 |
| `src/flownote_agent/eval/tool_eval.py` | 도구 호출 정확도 (teacher-forced) |
| `src/flownote_agent/runtime/agent_loop.py` | 한 턴 안에서 이어지는 think→call→observe 루프 |
| `src/flownote_agent/runtime/mock_tools.py` | 인메모리 FlowNote. 백엔드 없이 루프를 돌려볼 수 있습니다 |

## RunPod

첫 GPU 환경은 **[학습 환경 가이드](docs/TRAINING.md)**를 따라 준비하세요.
`bash scripts/runpod_bootstrap.sh`로 별도 `.venv-gpu`를 만들고,
`source outputs/training-env.sh` 후 `make smoke`로 시드 9건 기반 10스텝 학습과
어댑터 저장·재로딩을 확인할 수 있습니다. 이 경로는 합성 데이터 API를 사용하지 않습니다.

**파드 설정** — RunPod PyTorch 2.7+ (CUDA 12.x), RTX 4090 24GB,
네트워크 볼륨 80GB를 `/workspace`에 마운트.

```bash
git clone <this repo> /workspace/flownote-agent
cd /workspace/flownote-agent
bash scripts/runpod_bootstrap.sh
```

Gemma 4는 **Apache-2.0이고 게이트 저장소가 아니라 HF 토큰이 필요 없습니다**
(있으면 다운로드 속도 제한만 풀립니다). 부트스트랩은 학습용 의존성을 설치하고
Gemma 4 지원·CUDA NF4 연산·토크나이저를 검사합니다. 기본 모델 가중치는
`make smoke`의 실제 학습 단계에서 내려받습니다.

볼륨을 안 붙이면 파드 재시작마다 체크포인트를 다시 받습니다.

## 전체 흐름

```bash
make tokenizer                      # 제어 토큰 12개 + 한국어 실측 압축률
make eval-base                      # ← 베이스라인. 건너뛰지 마세요

python -m flownote_agent.data.synth --n 100 --out data/processed/synth.jsonl
make synth                          # 수락률/비용 확인 후 2000건
make data                           # 공개 데이터셋과 믹싱

make dry                            # 감독되는 토큰을 디코드해서 눈으로 확인
tmux new -s train && make train
make eval                           # eval-base 숫자와 비교
make chat                           # 목 도구로 실제 루프 돌려보기
make gguf                           # 파드 내리기 전에
```

`make dry`가 출력하는 "SUPERVISED" 블록에 user 발화나 `declaration:`이 섞여 있으면
마스킹이 깨진 겁니다. 학습 시작 전에 잡으세요.

## 평가 지표

- **parses cleanly** — 파서가 읽을 수 있는 스텝 비율. 파인튜닝 후 99% 목표
- **tool name exact / full args exact** — 이름은 쉽고 인자가 어렵습니다
- **schema-valid calls** — 실제로 실행 가능한 호출 비율
- **hallucinated tools** — 명세에 없는 도구를 부른 비율. 0이어야 합니다
- **called when it should not** — 인자를 모를 때 추측하지 않고 되묻는 능력.
  학습 데이터의 `clarify` 시나리오가 담당합니다

## 비용 주의

합성 데이터가 예산의 대부분입니다. 수락 건당 대략 Opus 5 $0.053 / Sonnet 5 $0.032 /
Haiku 4.5 $0.011이고, **3만 건을 만들면 어떤 모델로도 수백 달러입니다.**
2,000~3,000건만 만들고 물량은 공개 데이터셋으로 채우세요. 근거와 내역은
[docs/PLAN.md §0⑥](docs/PLAN.md).

`configs/data_mix.yaml`의 xLAM은 **CC-BY-NC-4.0(비상업)** 이고 게이트 저장소입니다.
개인용이면 무관하지만 제품으로 낼 계획이면 데이터 소스와 교사 모델 약관을 다시
확인해야 합니다.
