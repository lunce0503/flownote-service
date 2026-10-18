# 첫 GPU 학습 환경 만들기

시드 데이터 9건으로 **환경 검사 → 10스텝 QLoRA 학습 → 저장 → 별도 프로세스에서 재로딩·생성**을 확인한다. 모델 성능을 평가할 규모의 학습은 아니다. 합성 데이터 API나 공개 데이터 다운로드는 필요 없으며, 기본 모델 가중치는 첫 학습 때 다운로드한다.

## 1. RunPod 준비

- GPU: RTX 4090 24GB 1장으로 시작하고 실제 메모리 사용량은 짧은 학습으로 확인한다.
- 이미지: CUDA PyTorch 2.7 이상, Python 3.10 이상이 있는 RunPod PyTorch 이미지.
- 저장소: 80GB 네트워크 볼륨을 `/workspace`에 연결하는 구성을 권장한다. 설치 전 여유 공간 30GiB 이상을 검사한다.
- 연결: Pod의 Connect 화면에서 직접 SSH 접속 정보를 확인한다. Jupyter는 필수가 아니다.

스크립트는 Pod 생성이나 결제를 수행하지 않는다. 네트워크 볼륨은 Pod와 독립적으로 유지되며 같은 데이터센터의 GPU와 연결한다. [RunPod 저장소 문서](https://docs.runpod.io/pods/storage/types)

## 2. 현재 코드를 GPU 서버로 복사

현재 작업 폴더에는 커밋되지 않은 변경이 있으므로 Git 원격 저장소만 clone하면 새 파일이 누락될 수 있다. 현재 폴더를 복사하거나 변경을 커밋한 뒤 해당 커밋을 사용한다.

로컬에서 아래 SSH 포트와 주소를 실제 값으로 바꿔 실행한다. `rsync`를 지원하는 직접 SSH 연결과 양쪽의 rsync 설치가 필요하다. SSH 프록시 연결만 제공되는 경우 별도 파일 전송 경로나 Git 저장소를 사용한다.

```bash
rsync -av --exclude='.git/' --exclude='.env' --exclude='.venv/' \
  --exclude='.venv-gpu/' --exclude='outputs/' --exclude='hf_cache/' \
  --exclude='__pycache__/' --exclude='.pytest_cache/' \
  -e 'ssh -p SSH_PORT' ./ root@GPU_HOST:/workspace/flownote-agent/
```

## 3. GPU 서버에서 설치

```bash
cd /workspace/flownote-agent
bash scripts/runpod_bootstrap.sh
source outputs/training-env.sh
```

설치 스크립트는 다음을 수행한다.

1. CUDA·BF16·PyTorch 버전과 공간을 검사한다. CPU 환경에서는 설치 전에 종료한다.
2. `.venv-gpu`를 만들고 이미지의 CUDA PyTorch를 재사용한다. pip에 torch/torchvision/torchaudio의 기존 버전 제약을 전달한다.
3. `requirements-train.txt`의 학습용 의존성을 설치한다.
4. 작은 텐서로 NF4 CUDA 연산과 backward를 확인한다.
5. 실제 토크나이저 검사와 테스트를 실행한다.
6. `outputs/training-env.sh`, 환경 보고서, 실제 설치 버전 목록을 저장한다.

시스템 `.bashrc`를 수정하지 않는다. 새 SSH 세션마다 `source /workspace/flownote-agent/outputs/training-env.sh`를 실행한다. 필요하면 서버 환경 변수로 `HF_TOKEN`을 설정한다. 스크립트는 토큰을 파일이나 git credential에 저장하지 않는다.

의존성은 호환 범위로 설치하고 정확한 버전을 `outputs/environment/requirements-freeze.txt`에 기록한다. 여러 이미지에서 검증한 고정 lockfile은 아니므로 사용한 CUDA 이미지도 함께 기록해 재사용한다. QLoRA 구성은 [PEFT 양자화 학습 문서](https://huggingface.co/docs/peft/main/en/developer_guides/quantization)의 NF4 + LoRA 흐름을 따른다.

## 4. 짧은 학습

SSH 연결이 끊겨도 유지하려면 tmux 안에서 실행한다. tmux가 없는 이미지에서는 먼저 OS 패키지 관리자로 설치한다.

```bash
tmux new -s flownote-train
cd /workspace/flownote-agent
source outputs/training-env.sh
make smoke
```

기본값은 **학습 7건 / 평가 2건, LoRA r=8, 길이 상한 2048, 학습·평가 배치 1, gradient accumulation 1, optimizer update 10회**다. 학습 전에 dry-run으로 감독 토큰과 길이를 확인한다. 데이터는 분리한 대화 단위이며 두 집합이 겹치지 않는다.

```text
outputs/smoke-실행시각/
├── train.jsonl / eval.jsonl       시드 분리
├── train.yaml                    작은 실험 설정
├── environment.json              GPU·CUDA·패키지 정보
├── requirements-freeze.txt        설치 버전
├── run.log                       실행 로그
├── adapter/
│   ├── checkpoint-10/            재개용 체크포인트
│   └── final/                    어댑터와 토크나이저
└── reload-eval.jsonl             재로딩 후 생성 결과
```

`Smoke completed`는 학습·저장·재로딩·추론 명령이 정상 종료됐다는 뜻이다. 생성 품질을 성공 조건으로 강제하지 않는다. 재로딩 검사는 출력 128토큰으로 제한하므로 잘린 응답이 나올 수 있다.

실험 길이와 경로를 바꾸려면 `SMOKE_STEPS=20 SMOKE_DIR=outputs/smoke-second make smoke`를 사용한다. 기존 내용이 있는 디렉터리는 덮어쓰지 않는다. `make clean`은 outputs를 삭제하므로 결과를 보관하려면 실행하지 않는다.

## 5. GPU 없이 데이터·마스크 검사

기존 로컬 가상환경에서 실행 가능하다. 실제 GPU 학습 검증은 아니다.

```bash
.venv/bin/python scripts/prepare_smoke.py --out-dir outputs/smoke-local
PYTHONPATH=src .venv/bin/python -m flownote_agent.train.sft \
  --config outputs/smoke-local/train.yaml --dry-run
```

## 6. 문제 해결

| 증상 | 확인할 부분 |
| --- | --- |
| CUDA unavailable | GPU Pod와 CUDA 빌드 PyTorch 여부 |
| NF4 검사 실패 | bitsandbytes·CUDA 드라이버·PyTorch 호환성 |
| pip 의존성 충돌 | 이미지의 CUDA 패키지 버전 제약. 호환되는 PyTorch 이미지 사용 |
| 다운로드 실패 | 네트워크·HF 접근 권한·캐시 공간 |
| 학습 중 메모리 부족 | max_seq_len을 줄이고 dry-run으로 남은 샘플 수 확인 |
| 학습 후 출력 이상 | run.log, reload-eval.jsonl, 감독 토큰, use_cache/checkpointing 조합 |

환경 검증 후에는 실제 데이터로 학습하고 같은 평가셋으로 기본 모델과 비교한다. 합성 데이터·전체 데이터 빌더에는 추가 의존성을 활성화된 학습 가상환경에 설치한다.

```bash
python -m pip install -c outputs/environment/cuda-constraints.txt -r requirements.txt
```
