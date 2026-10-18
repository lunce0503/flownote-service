# Canvas LoRA 샘플 준비

사용자의 요청으로 Flownote Canvas 3개를 읽기 전용으로 추출하여 별도 Codex 작업 공간에 저장했다. 프로젝트 소스와 운영 데이터는 수정하지 않았다.

- Canvas 문서의 리비전과 원본 JSON SHA-256을 기록했다.
- 총 2,274획을 현재 Konva 선 렌더링 규칙에 따라 전체 PNG 3개와 확대 PNG 14개로 렌더링했다.
- Codex의 시각 해석으로 전사·그림 설명·관계·불확실한 영역·요약 초안을 작성했다.
- 추출용·요약용 JSONL 후보는 각각 3행이며 모두 미검수 상태다. 검수 완료 샘플은 0개다.
- JSON 파싱, 획·점 개수, 이미지 참조와 크기, 원본 체크섬, 주석 노드 참조를 검증했다.
- Gemma 추론 및 LoRA 학습은 실행하지 않았다. 런타임 변경이 없고 보고서만 추가하여 빌드·클라우드 배포는 생략했다.

산출물은 `/home/kwon/Documents/Codex/2026-10-07/runpod-gamma-4-e2b-runpod/outputs/flownote-canvas-samples/`와 같은 outputs 폴더의 ZIP에 있다. 원본 업로드·데이터 내용이나 인증 정보는 이 보고서에 포함하지 않았다. 다음 단계는 초안 검수와 대표 Canvas 샘플 확장, 베이스 모델 비교다.
