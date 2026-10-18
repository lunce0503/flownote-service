# flownote-agent 연구 코드·계획 편입

## 요청과 결과

사용자 요청: “ai/flownote-agent도 Flownote로 편입시켜”.

`AI/flownote-agent`의 현재 소스·설정·테스트·학습 문서·시드·노트북 42개(315,497 bytes)를 `Flownote/service/research/flownote-agent`에 복사했다. 원본의 미커밋 변경도 포함했고 복사 직후 파일별 SHA-256 일치를 확인했다. 이후 양쪽 README와 기술 계획에 관리 위치를 안내하는 문구를 추가했다.

원본 저장소·이력·가상환경은 보존했다. 인증값·가중치·생성 데이터·체크포인트·캐시는 복사하지 않았다. 노트북은 출력이 없는 교육용 코드다. 실제 Canvas 데이터와 LoRA 파일럿 가중치는 기존 산출물 위치에 유지했다.

[실행 계획](../../docs/exec-plan/active/2026-10-14-flownote-agent-integration.md), [제품 사양](../../docs/product-specs/note-task-agent.md), 연구 색인·문서 지도·제품 관점·설계·코드맵에 편입 상태를 반영했다. IDLE 계획에도 공통 실행 계약과 도구 권한 경계를 연결했다.

## 검증

새 모듈 디렉터리에서 기존 원본 Python 환경을 사용했다. import·테스트·상대 경로는 새 모듈을 가리킨다.

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src /home/kwon/AI/flownote-agent/.venv/bin/python -m pytest -p no:cacheprovider tests -q
```

결과: 87 passed in 12.08s, skip 0. 외부 다운로드·모델 학습 없이 프로토콜·마스킹·데이터/루프·학습 준비 테스트를 통과했다.

- 새 경로의 `flownote_agent` import 위치를 확인했다. 시드 9건의 구조·도구 인자·왕복 변환 검증 통과, 도구 명세 14개 로드 성공.
- Python 파일 23개 문법 검사와 셸 스크립트 3개 `bash -n` 통과.
- 안내 문구를 추가한 README·PLAN을 제외한 40개 파일은 원본과 SHA-256 일치. 복사된 파일 총 42개이며 제외 대상 가중치·인증 파일·캐시 없음.
- 변경 문서 18개, 코드 블록·inline code를 제외한 로컬 링크 55개와 중복 제목 검사: 오류 0. Flownote와 원본 연구 저장소의 변경 문서 대상 `git diff --check`: 각각 종료 코드 0. 기존 줄 끝 공백과 코드 블록은 보존했다.

## 다음 단계와 배포

14개 연구 도구를 실제 사용자별 노트·작업 API에 매핑하고, baseline 평가·검수 데이터·GPU smoke·학습·서비스 어댑터·선정 순서로 진행한다. 현재 CLI는 mock 도구를 사용하며 실제 서비스의 지원 기능으로 표시하지 않는다.

이번 편입은 연구 모듈 관리 위치와 문서 변경이며 운영 API·requirements·Dockerfile·모델 제공자·DB는 바꾸지 않았다. 운영 실행 산출물 변경이 없어 앱 빌드·클라우드 배포·서비스 재시작은 생략했다. GPU 실행·교사 API 호출·모델 다운로드·commit/push는 수행하지 않았다.
