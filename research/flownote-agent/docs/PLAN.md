# FlowNote 에이전트 — 수정된 구축 계획

> 2026-10-14: 이 모듈의 단계·상태는 [Flownote 편입 실행 계획](../../../docs/exec-plan/active/2026-10-14-flownote-agent-integration.md)에서 관리한다. 아래는 기존 모델·학습 설계 기록이며 사양·가격·데이터 조건은 실제 실행 전에 재확인한다.

베이스 모델은 **Gemma 4 E2B** (`google/gemma-4-E2B-it`, 2026-04-02 릴리스)입니다.
원본 기획서의 방향은 유지하되, 실제로 학습을 돌리면 막히는 지점을 고쳤습니다.
무엇을 왜 바꿨는지 먼저 적습니다.

---

## 0. 원본 기획서에서 고친 것

### ① Gemma 4는 에이전트 프로토콜을 **네이티브 토큰으로 갖고 있습니다** ← 가장 큰 변경

원본 기획서 2장은 `<thought>`, `<tool_call>` 같은 태그를 직접 정의해서 토크나이저에
등록하자고 했습니다. **그럴 필요가 전혀 없습니다.** Gemma 4는 에이전트 루프 전체를
단일 토큰으로 이미 갖고 있습니다. `scripts/check_tokenizer.py`로 실측한 결과:

| 토큰 | id | 용도 |
| :--- | ---: | :--- |
| `<\|turn>` / `<turn\|>` | 105 / 106 | 턴 구분 |
| `<\|tool>` / `<tool\|>` | 46 / 47 | 도구 선언 |
| `<\|tool_call>` / `<tool_call\|>` | 48 / 49 | 모델의 도구 호출 |
| `<\|tool_response>` / `<tool_response\|>` | 50 / 51 | 환경의 실행 결과 |
| `<\|"\|>` | 52 | 문자열 구분자 |
| `<\|think\|>` | 98 | 사고 모드 활성화 |
| `<\|channel>` / `<channel\|>` | 100 / 101 | 추론 채널 |

12개 전부 단일 토큰입니다. 따라서 **토크나이저에 아무것도 추가하지 않고**,
262,144 × 1536 임베딩 행렬을 resize할 일도 없습니다. 기획서가 우려했던
"임베딩 레이어 메모리 비중" 문제는 애초에 발생하지 않습니다.

또 하나: **인자가 JSON이 아닙니다.** Gemma 4는 전용 문자열 구분자를 쓰는 자체 포맷을
씁니다.

```
<|tool_call>call:set_reminder{message:<|"|>스탠드업 준비<|"|>,remind_at:<|"|>2026-07-30T10:10:00+09:00<|"|>}<tool_call|>
```

`<|"|>`가 한 토큰이라 JSON보다 저렴합니다 (실측: 네이티브 51토큰 vs JSON 54토큰,
한글을 `\uXXXX`로 이스케이프한 JSON은 76토큰). `protocol.py`의
`format_argument` / `parse_arguments`가 이 문법을 정확히 구현합니다.

### ② 에이전트 루프 전체가 **하나의 model 턴** 안에서 이어집니다

Gemma 3 계열은 도구 결과를 새 user 턴으로 돌려줬습니다. Gemma 4는 다릅니다:

```
<|turn>model
<|channel>thought
노트를 먼저 검색해야 한다.
<channel|><|tool_call>call:search_notes{query:<|"|>배포<|"|>}<tool_call|><|tool_response>response:search_notes{count:1,...}<tool_response|><|channel>thought
id를 얻었다.
<channel|>1건 찾았습니다.<turn|>
```

thought → call → **환경의 응답** → thought → 최종 답변이 전부 한 턴입니다. 이게
손실 마스킹 설계를 바꿉니다 — 턴 단위로 자를 수 없고, **토큰 단위 상태 기계**로
`<|tool_response>`와 `<tool_response|>` 사이(환경이 쓴 텍스트)를 빼야 합니다.
`protocol.build_loss_mask()`가 그 일을 하고 `tests/test_masking.py`가 지킵니다.

**`<|tool_response>` 여는 토큰은 학습하고 내용은 학습하지 않습니다.** 그 토큰이
"이제 환경 차례"라는 정지 신호이기 때문입니다. 이걸 마스킹하면 모델이 도구 결과를
스스로 지어내고 자기가 상상한 결과에 답합니다 — 파인튜닝 에이전트의 가장 흔한 실패입니다.

### ③ Gemma 4에는 **네이티브 system 롤이 있습니다**

Gemma 3에는 없어서 시스템 프롬프트를 첫 user 턴에 접어 넣어야 했지만, Gemma 4는
`<|turn>system`을 그대로 씁니다. 도구 명세도 그 안에 `<|tool>declaration:...<tool|>`로
들어갑니다. 기획서의 "user 턴 안에 `<system>` 태그" 구조는 이제 불필요합니다.

### ④ 렌더링은 **공식 chat template을 그대로 씁니다**

Google이 400줄짜리 Jinja 템플릿을 배포하고, **2026-07-09에 "tool-calling loops,
turn closures, thinking content-ordering" 수정본**을 냈습니다. 이걸 손으로 다시
구현하면 반드시 어긋납니다. `protocol.render()`는 `tokenizer.apply_chat_template()`을
호출하고, 우리가 직접 쓰는 건 **파서뿐**입니다 (파서는 템플릿에 없으니까요).

한 가지 함정: 도구 결과를 OpenAI 스타일 `{"role": "tool", "content": {...}}`로 넘기면
**템플릿이 크래시합니다** (`'str object' has no attribute 'get'`). Gemma 네이티브
경로인 `tool_responses`를 assistant 메시지에 붙여야 구조화된
`response:name{k:v}` 형태가 나옵니다. `to_chat_messages()`가 자동으로 접어 넣습니다.

### ⑤ E2B는 실효 2.3B, **원시 5.15B**

VRAM에 올라가는 건 원시 파라미터입니다. 24GB + 4-bit면 충분합니다
(Unsloth 보고 기준 E2B LoRA 8~10GB). 컨텍스트는 128K, vocab 262,144,
**Apache-2.0이고 게이트 저장소가 아닙니다** — HF 토큰 없이 받을 수 있습니다.

### ⑥ 합성 데이터 3만 건 = $20~40은 크게 낮은 추정입니다

건당 입력 ~1,400 / 출력 ~1,200 토큰(Opus 5는 사고 토큰이 출력으로 과금되고 기본
활성입니다), 검증 통과율 70% 기준 실제 단가:

| 교사 모델 | 단가 (in/out per MTok) | 수락 건당 | 2,000건 | 30,000건 |
| :--- | :--- | ---: | ---: | ---: |
| `claude-opus-5` | $5 / $25 | ~$0.053 | **~$105** | ~$1,590 |
| `claude-sonnet-5` | $3 / $15 | ~$0.032 | ~$64 | ~$960 |
| `claude-haiku-4-5` | $1 / $5 | ~$0.011 | ~$22 | ~$330 |

**3만 건은 어떤 모델로도 $40이 아닙니다.** 권장: 합성은 **2,000~3,000건**만,
물량은 공개 데이터셋으로. 합성 데이터의 값은 물량이 아니라 **당신의 실제 도구
스키마를 본 유일한 데이터**라는 데 있습니다.

`--model`, `--effort`로 조절할 수 있습니다. `single_call` 같은 쉬운 시나리오는
Sonnet 5 + `--effort low`로 벌크 생성하고, `multi_step` / `error_recovery` /
`clarify`처럼 학습 가치가 높은 것만 Opus 5로 뽑는 게 가장 효율적입니다.

### ⑦ 라이선스 — 개인용이면 무관, 배포하면 문제

- `Salesforce/xlam-function-calling-60k` — **CC-BY-NC-4.0(비상업)**, 게이트 저장소
- `glaiveai/glaive-function-calling-v2` — Apache-2.0
- `google/gemma-4-E2B-it` — Apache-2.0 (제약 없음)
- 상용 API 출력으로 학습한 모델은 해당 벤더 약관의 제한을 받을 수 있습니다

---

## 1. 학습 시 반드시 알아야 할 Gemma 4 함정 3개

전부 코드에 반영돼 있지만, 직접 손댈 때 다시 밟을 수 있는 것들입니다.

### `mm_token_type_ids`가 없으면 forward가 죽습니다

텍스트만 학습해도 Gemma 4의 forward는 `mm_token_type_ids`와 `token_type_ids`를
요구합니다 (텍스트는 전부 0). 없으면
``mm_token_type_ids` is required as a model input when training`으로 실패합니다.
`Gemma4Collator`가 넣어주고, `TrainingArguments`에 **`remove_unused_columns=False`**가
필수입니다 — 안 그러면 Trainer가 다시 떼어냅니다.

### LoRA를 접미사로 지정하면 학습이 시작도 못 합니다

Gemma 4의 vision/audio 타워도 `q_proj`, `gate_proj` 같은 **같은 이름**을 쓰는데,
`Gemma4ClippableLinear`로 감싸여 있고 PEFT가 이 타입을 거부합니다. 직접 확인:

```
target_modules=["q_proj", ...]        → ValueError: Target module
                                        Gemma4ClippableLinear is not supported
scope_contains="language_model"       → 205개 모듈, 정상 (학습 48.3M / 전체 5.15B)
```

`resolve_lora_targets()`가 런타임에 실제 모듈 이름을 열거해서 텍스트 디코더로
좁힙니다. 몽키패치가 필요 없습니다.

부수 효과 하나: E2B는 **KV를 레이어 간 공유**해서 `q_proj`/`o_proj`는 35개인데
`k_proj`/`v_proj`는 **15개**입니다. 손으로 쓴 목록이었으면 틀렸을 값을 열거가
공짜로 맞춥니다.

### `use_cache=False`가 E2B를 망가뜨린다는 보고

일반적으로 gradient checkpointing과 함께 캐시를 끄지만, E2B/E4B는 KV 공유 때문에
캐시를 끄면 출력이 깨진다는 보고가 있습니다. `configs/train_qlora.yaml`에서
`use_cache: true`로 두되 **논쟁 중인 설정으로 명시**해 뒀습니다. loss는 정상인데
샘플이 이상하면 여기를 먼저 뒤집으세요.

---

## 2. 파이프라인

```
configs/tools/flownote_tools.json     14개 도구 JSON Schema — 단일 진실 공급원
        │
        ├── scripts/make_seed.py      손으로 쓴 9개 예제 (포맷 문서 + 스모크 테스트)
        ├── data/synth.py             교사 모델로 FlowNote 특화 대화 생성
        │                             → 생성 즉시 실제 스키마로 검증, 실패는 폐기+집계
        └── data/build_dataset.py     공개 데이터셋 변환 + 비율 맞춤 + 언어 밸런싱
                │
                └── data/processed/{train,eval}.jsonl
                        │
                        ├── train/sft.py        QLoRA SFT (model 턴만 손실 계산)
                        ├── eval/tool_eval.py   도구 호출 정확도 측정
                        └── runtime/agent_loop.py  think→call→observe 루프
```

`protocol.py`가 **인코딩과 파싱을 같은 파일에** 담습니다. 이 둘이 갈라지면
"도구 호출 성공률이 왜 낮은지 모르겠다"는 형태로 나타나고 원인 찾는 데 며칠 갑니다.
84개 테스트가 이 계약을 지킵니다.

## 3. 데이터 믹스에서 알아둘 것

`configs/data_mix.yaml`은 원본의 45 / 30 / 25 비율을 따릅니다. 다만
**xLAM에는 추론 과정(CoT)이 없습니다.** 변환기가 `"Call X to answer the request."`
수준의 형식적 thought를 붙이는데 의도적입니다 — thought가 있는 예제와 없는 예제를
섞으면 모델은 thought를 생략하는 걸 배웁니다. 대신 이게 믹스의 20%라는 건
**생각의 질은 합성 데이터와 Glaive가 전담한다**는 뜻입니다.

빌더는 각 소스가 실제로 몇 %를 채웠는지, 몇 건이 왜 버려졌는지 출력합니다.
한 소스가 80%를 버리고 있으면 학습한 믹스는 설계한 믹스가 아닙니다.

## 4. 현실적인 기대치

E2B는 실효 2.3B이고, **이미 네이티브 tool-calling으로 instruction tuning이
되어 있습니다.** 이게 중요합니다:

- **잘 됨** — 단일 도구 선택, 인자 채우기, 문법, 한/영 응답, 2~3단계 순차 호출
- **되다 말다 함** — 4단계 이상 계획, 실패 후 우회 전략, 도구 15개 넘을 때 선택
- **안 됨** — 도구 명세만 보고 문서화되지 않은 동작 추론하기

**`make eval-base`를 먼저 돌리세요.** 베이스가 이미 잘하기 때문에, 파인튜닝의
가치는 "형식을 100%로 만드는 것"과 "당신의 14개 도구를 외우게 하는 것"이고,
베이스 점수를 모르면 그 가치를 측정할 수 없습니다.

## 5. 예산 (수정)

| 항목 | 내용 | 비용 |
| :--- | :--- | :--- |
| 합성 데이터 | 2,000건, Sonnet 5 벌크 + Opus 5 난이도 높은 시나리오 | $40 ~ $105 |
| GPU | RunPod RTX 4090, 부트스트랩+실험+학습 6~8시간 | $4 ~ $6 |
| 재학습 버퍼 | 하이퍼파라미터 2~3회 재시도 | $10 |
| 스토리지 | 네트워크 볼륨 60GB, 한 달 | ~$5 |
| **합계** | | **약 $60 ~ $125 (8만 ~ 17만 원)** |

원본 기획서(5만~10만 원)보다 조금 높고, **내부 배분이 완전히 다릅니다**:
GPU는 예상보다 훨씬 싸고(E2B는 작고 게이트도 없습니다), 합성 데이터가 거의 전부입니다.
합성 물량을 3만 건으로 올리는 순간 $1,000을 넘어가는 게 진짜 위험 지점입니다.

`--n 100`으로 시작해서 수락률과 실제 청구액을 확인한 다음 올리세요.

## 6. 순서

1. `make test` — GPU 불필요. 84개 테스트로 계약 확인
2. `make seed` — 손으로 쓴 9건 검증
3. RunPod 파드 생성 → `bash scripts/runpod_bootstrap.sh`
4. `make tokenizer` — 제어 토큰이 전부 단일 토큰인지, 한국어 실측 압축률 확인
5. `make eval-base` — 베이스라인 확보 ← 건너뛰지 마세요
6. `make synth` (`--n 100`으로 먼저) → `make data`
7. `make dry` — 감독되는 토큰을 눈으로 확인 (user 발화가 섞였으면 마스크가 깨진 것)
8. `make train` (tmux 안에서)
9. `make eval` → 5번 숫자와 비교
10. `make gguf` — 파드 내리기 **전에**
