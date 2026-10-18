# Canvas LoRA 파일럿 학습 결과

사용자 요청에 따라 별도 Codex 작업 공간에서 RunPod RTX 4090으로 Gemma 4 E2B BF16 LoRA를 12 step 학습했다. Flownote 앱 소스와 운영 데이터는 수정하지 않았다.

- 실제 Canvas 3개 중 2개를 학습하고 1개는 학습에서 제외했다.
- 라벨은 미검수 Codex 의사 라벨이며 사람 검수 완료 상태로 변경하지 않았다.
- r=16, alpha=16, batch=1, accumulation=1, learning rate=1e-4. Vision encoder는 고정하고 언어 Attention·MLP를 학습했다.
- 질문·이미지의 loss 마스킹과 정답 보존을 확인했다. 410개의 LoRA 텐서가 갱신됐고 학습은 약 29초 걸렸다.
- 새 프로세스에서 저장한 adapter·processor를 재로딩했다. 생성 앞부분이 저장 직후 평가 결과와 일치했다.
- 베이스와 adapter 18개 파일(9.70 GiB)의 SHA-256이 RunPod 원본과 일치했다. 권한이 있는 Ubuntu 서버 작업 폴더에 checkpoint·로그·실제 추출·요약 결과도 보관했다.
- SFTTrainer가 변경한 EOS 조건을 복원하여 전후 평가 조건을 맞췄다. 최초 프로세스는 학습 저장 완료 후 평가 재실행을 위해 종료했다.
- 출력 품질은 개선됐다고 판단하지 않았다. 기술 필기에서는 반복·불완전 JSON, 한글 필기에서는 오인식과 요약으로의 오류 전파를 관찰했다. 권장 sampling에서도 Transformer LoRA는 반복했다.

실사용 모델로 선정하거나 서비스에 적용하지 않았다. 다음 단계는 검수된 전사와 영역별 이미지·정답 쌍 준비, 출력 스키마 검증, 검수 데이터 기반 본 학습이다.

산출물 위치: `/home/kwon/Documents/Codex/2026-10-07/runpod-gamma-4-e2b-runpod/outputs/canvas-lora-run-001/`. 원본 데이터 내용과 인증 정보는 이 보고서에 기록하지 않았다. 실행 프로세스는 종료했고 Pod 자체는 중단하지 않았다. 프로젝트에서는 보고서만 추가했으며 빌드·스테이징·production 배포는 생략했다.
