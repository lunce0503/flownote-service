# flownote-agent의 Flownote 편입

작성: 2026-10-14. 상태: 연구 코드·계획 편입 완료, GPU 학습·서비스 적용 전.

## 목표와 성공 기준

`AI/flownote-agent`를 Flownote의 노트·작업 에이전트 연구 모듈로 편입한다. 소스·설정·테스트·학습 가이드는 [`research/flownote-agent`](../../../research/flownote-agent/README.md)에서 관리하고 이후 진행 상황은 이 문서에 기록한다.

현재 작업 디렉터리의 미커밋 변경까지 포함한 연구 코드를 가져왔다. 원본은 전환 참고용으로 보존한다. Git 메타데이터·가상환경·인증값·모델 가중치·생성 데이터·체크포인트는 복사하지 않는다. 운영 AI 제공자나 자동화 모델을 편입만으로 교체하지 않는다.

- 연구 편입 완료 기준: 새 위치에서 소스·설정·시드·테스트가 동작하고 관리 위치와 검증 결과가 기록된다.
- 서비스 적용 완료 기준: 기본 모델 대비 품질, 실제 도구 권한·취소·제한·사용자 격리를 검증하고 staging에서 통과한 동일 소스를 production에 적용한다. 이 단계는 미완료다.

목표 동작은 [노트·작업 에이전트 사양](../../product-specs/note-task-agent.md)을 따른다.

## 편입 자산과 현재 상태

| 자산 | 모듈 내부 위치 | 현재 상태 |
| --- | --- | --- |
| 대화 자료형·파서·렌더링·손실 마스킹 | `src/flownote_agent/protocol.py` | 모델 전용 문법·template 연결 연구 구현 |
| 도구 명세·인자 검증 | `configs/tools/flownote_tools.json`, `src/flownote_agent/tools.py` | 14개 연구 도구. 실제 API·권한과의 매핑은 후속 작업 |
| 데이터 변환·검증·합성·분할 | `src/flownote_agent/data/`, `data/seed/`, `configs/data_mix.yaml` | 시드 9건과 준비 코드. 전체 학습 데이터 완성 근거 없음 |
| QLoRA 학습·GPU 준비 | `src/flownote_agent/train/`, `configs/train_qlora.yaml`, `scripts/` | 학습·저장·재로딩 경로 구현. 이번에 GPU 실행 안 함 |
| 도구 호출 평가 | `src/flownote_agent/eval/tool_eval.py` | 정답 prefix를 주는 teacher-forced 평가. 실제 다단계 성공률은 별도 평가 필요 |
| 실행 루프·모의 도구 | `src/flownote_agent/runtime/` | 최대 6단계·context budget·검증 오류 반환. CLI는 mock 도구 사용 |
| 회귀 테스트 | `tests/` | 새 위치에서 오프라인 87개 통과, skip 0 |
| 노트북·가이드 | `research/`, `docs/` | 교육 노트북과 기존 기술 기록. 사양·가격·데이터 조건은 실제 학습 전 재확인 |

패키지명 `flownote_agent`와 내부 배치를 유지한다. 연구 의존성은 모듈의 requirements로 관리하며 `flownote-ai`의 운영 의존성·Dockerfile·uv.lock에 합치지 않는다.

## IDLE와 Canvas 연구의 관계

[개발 작업 공간 계획](2026-10-14-idle-integration.md)은 코드 변경·실행 이력·diff 검토를 담당한다. 이 모듈은 노트·작업 도구 선택과 학습·모델 평가를 담당한다.

- 공통 Run/Event/Approval이 구현되면 연구 런타임을 제공자 어댑터로 연결한다. 모델 전용 제어 토큰은 클라이언트 공통 계약 밖에서 처리한다.
- 취소·상태·제한은 공통 실행 계약에 맞추고, 노트·작업 권한은 도메인 서비스가 최종 판정한다.
- IDLE/Codex의 shell·patch·배포 권한을 노트 에이전트에 자동으로 제공하지 않는다. 기존 Codex 워커·피드백 자동화는 유지한다.

2026-10-07 [Canvas LoRA 파일럿](../../../logs/report/2026-10-07-0056-canvas-lora-pilot-training.md)은 이미지 전사·요약 실험으로 별도 관리한다. 학습·저장·재로딩은 확인했으나 품질 개선은 확인하지 못했다. 해당 가중치·원본 데이터는 기존 위치에 보존하며 노트 에이전트의 학습 완료나 서비스 선정 근거로 사용하지 않는다.

## 서비스 연결과 책임

아래는 예정 연결이며 실제 API·마이그레이션·제공자 활성화는 수행하지 않았다.

- 연구: `research/flownote-agent`에서 학습·평가·export를 운영 API와 분리한다.
- 서비스 어댑터: 향후 `flownote-ai`에 검증된 제공자·실행 정책 연결. 현재 중지 상태·Gemini 계약을 편입만으로 바꾸지 않는다.
- 사용자 진입: 기존 `flownote-API`·세션 인증·웹/모바일 Agent 흐름. 연구 CLI를 공개 서버로 노출하지 않는다.
- 도구 실행: 노트·폴더·본문은 `flownote-canvas`, 작업·일정은 `flownote-serve`의 사용자별 API를 사용한다.
- 스키마: 필요하면 Spring Flyway와 공통 실행 계약을 확장한다. 폐기된 SQLite 인덱스·Ollama/agent-note는 복원하지 않는다.

| 연구 도구 | 확인할 실제 계약 |
| --- | --- |
| create/search/get/update/delete_note | 본문·검색·폴더·태그·휴지통의 실제 지원 범위, 소유권, 문서 버전, 삭제 확인 |
| link_notes | 관계 저장 계약 유무. 없으면 비활성화 |
| summarize_note | 허용 본문·언어·길이·원문 근거. 저장은 별도 요청 |
| create_task/list_tasks | 날짜·우선순위·상태·사용자 범위 매핑 |
| set_reminder | 일정 저장과 실제 알림 전달 구분. 기반 미구현이면 성공으로 표시하지 않음 |
| get_current_time | 사용자 timezone·서버 기준 시각으로 상대 시간 해석 |
| web_search/fetch_url | 제공자·URL 검증·네트워크·출력 한도. 노트 자동 외부 전송 금지 |
| export_note | 실제 지원 형식·artifact 소유권·다운로드 수명 |

mock 성공만으로 제품 지원을 판정하지 않는다. 삭제의 `confirm=true`는 모델 생성 boolean만으로 승인된 것으로 취급하지 않고 서버의 확인 기록·대상·버전을 검사한다.

## 단계와 상태

### 0. 연구 코드·계획 편입 — 완료

- [x] 소스·설정·시드·테스트·스크립트·노트북 42개를 복사하고 문서 수정 전 SHA-256 일치를 확인했다.
- [x] 새 경로에서 오프라인 회귀 테스트 87개 통과, skip 0을 확인했다.
- [x] 제품 사양·문서 지도·실행 계획·IDLE 계획을 연결하고 원본 관리 위치를 안내한다.

### 1. 실제 도구 계약 정리 — 다음 구현

- [ ] 14개 명세와 API를 매핑하고 미지원 기능·필드를 명시한다.
- [ ] 신뢰한 사용자 context·capability를 서버에서 주입하고 읽기·쓰기·삭제·외부 조회 정책을 정의한다.
- [ ] 인자·결과·오류 스키마, 멱등성·버전 충돌, 파서 오류 시 실행 차단을 검증한다.

완료 기준: 다른 사용자의 노트·작업·artifact 접근과 잘못된 도구 호출이 실제 작업을 실행하지 않는다.

### 2. 검수 데이터와 기본 모델 평가

- [ ] 한국어·영어·혼합 요청, 누락 인자 재질문, 삭제 확인, 상대 시각, 실패 복구 사례를 검수한다.
- [ ] 데이터 출처·사용 조건·동의·중복과 train/eval 분리를 기록한다. data_mix의 공개 데이터·교사 API 조건은 실제 사용 전 확인한다.
- [ ] 고정 평가셋에서 기본 모델의 파싱·schema 유효성·이름/인자 정확도·환각·불필요 호출을 측정한다.
- [ ] 실제 다단계 작업 성공률·변경 확인·지연·메모리·비용을 측정한다.

완료 기준: 데이터 지문·baseline 수치·실패 사례가 기록된다. README 목표치나 테스트 수를 성능 측정으로 대신하지 않는다.

### 3. GPU 학습과 재로딩

- [ ] 별도 GPU 환경에서 버전·CUDA·양자화·tokenizer·loss mask를 검사한다.
- [ ] 시드 9건의 10-step smoke로 학습·저장·재로딩을 확인한다.
- [ ] 검수 데이터 기반 QLoRA와 baseline 비교, 반복·잘린 호출·오실행 평가를 수행한다.
- [ ] GGUF를 사용할 경우 변환 후 같은 평가를 반복하고 모델·adapter·tokenizer checksum을 기록한다.

완료 기준: 재현 가능한 환경·데이터·학습 기록과 baseline 비교가 있다. 낮은 loss만으로 모델을 선정하지 않는다.

### 4. 서비스 어댑터와 공통 실행 연결

- [ ] `flownote-ai` 제공자·capability·timeout·취소·제한·확인·감사 메타데이터를 구현한다.
- [ ] verbose 내부 추론·전체 인자 출력을 사용자 화면/운영 로그와 분리하고 비밀값을 제거한다.
- [ ] 실제 CPU/GPU·inference endpoint·배포 자원을 결정한다. 가중치를 웹/API 이미지에 일괄 포함하지 않는다.
- [ ] 웹/모바일의 조회→제안→확인→변경→결과 저장 흐름을 구현한다.

완료 기준: staging 실제 API에서 저장·충돌·취소·권한·실패를 검증하고 disabled capability의 기존 동작을 유지한다.

### 5. 선정과 릴리즈

- [ ] 품질·도구 실행 안전성·성능 기준을 통과한 제공자만 활성화한다.
- [ ] staging 검증과 동일 소스 production 배포, health·capability·롤백을 확인한다.
- [ ] 모델·데이터·평가 버전과 알려진 실패를 운영 문서에 남긴다.

GPU·교사 API 실행은 별도 학습 작업의 범위·예산을 정한 뒤 진행한다. 이번 편입에서 학습·서비스 연결·모델 교체는 수행하지 않았다.

## 검증과 배포

전용 환경 준비 후 모듈에서 `PYTHONPATH=src .venv/bin/python -m pytest tests -q`를 사용한다. 이번에는 원본의 기존 Python 환경만 재사용하고 작업 경로·import·테스트는 새 모듈로 지정했다. `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`로 외부 다운로드를 차단했다.

seed는 재생성하지 않고 registry/schema/왕복 변환으로 검증한다. GPU 준비는 `docs/TRAINING.md`, baseline/학습/eval/export는 `Makefile`을 따른다. API 연결 단계에서 변경 서비스별 테스트·staging E2E와 사용자 격리·확인·중복·취소 검증을 추가한다.

이번 변경은 연구 코드 편입으로 배포 대상의 실행 산출물을 바꾸지 않았다. 앱 빌드·클라우드 배포·GPU 학습은 수행하지 않는다. 검증은 [편입 보고서](../../../logs/report/2026-10-14-0722-flownote-agent-integration.md)에 기록한다.

## 의사결정 로그

| 날짜 | 결정 | 근거와 대안 |
| --- | --- | --- |
| 2026-10-14 | 연구 코드를 Flownote에 편입하고 원본 보존 | 사용자 요청. 미커밋 수정까지 가져와 새 모듈에서 계속 관리 |
| 2026-10-14 | 운영 AI와 학습 의존성 분리 | GPU 학습과 API 부팅 요구가 달라 라이브러리를 일괄 합치지 않음 |
| 2026-10-14 | IDLE 실행과 노트 도구를 어댑터로 연결 | 코딩 실행·개인 데이터 권한이 다름. 두 루프를 무조건 합치지 않음 |
| 2026-10-14 | 도구 계약·baseline 검증을 모델 선정보다 먼저 수행 | mock 테스트·Canvas 파일럿으로 제품 성능을 입증할 수 없음 |
