# 게시글 Markdown 개편 계획·원인 조사·백그라운드 구현

## 사용자 요청과 문서

게시글 Markdown 원문, Canvas 스타일의 간결한 작업 공간, Windows 탐색기 형태의 category/folder/note 사이드바, 느린 로딩 개선을 계획했다. 제품 사양: docs/product-specs/blog-markdown-workspace.md. 기능 설계: docs/design-docs/blog/markdown-workspace-plan.md. 실행 추적: docs/exec-plan/completed/2026-10-19-blog-markdown-workspace.md. 관련 색인을 연결했다.

## 진단

노트 목록이 R2/S3 본문을 순차 조회하고 상세도 전체 목록을 재조회하는 코드 경로를 확인했다. staging 합성 노트/Canvas 각 5개로 5회 목록 API를 번갈아 측정했다. 게시글 중앙값 954ms/33,348 bytes, Canvas 201ms/770 bytes. API 목록 측정이며 production 또는 전체 브라우저 성능 개선 결과가 아니다. 최초 계정 POST 502와 후속 health/config 200도 구분해 기록했다. 자세한 근거·제약은 logs/bugs/2026-10-19-blog-loading.md에 남겼다.

## 실행

- 실행 ID: 20261019T135243Z-blog-markdown.
- systemd: flownote-codex-20261019T135243Z-blog-markdown.service; 실제 active/running과 Codex thread/turn/item 시작 확인.
- source commit: 21d2d9441c5338cbd2c9cd7394fd580715b1faaf; 현재 미커밋 변경을 포함한 별도 snapshot.
- snapshot commit: 7ad26f76b333d278ea3b6a7378e7247d546b2382; 파일 924개.
- 결과: /home/kwon/.local/state/flownote-codex/manual/20261019T135243Z-blog-markdown/worker-state/runs/20261019T135243Z-blog-markdown.
- 모델: 기존 자동화 기준 gpt-6.1-sol. Node v24.21.0, Yarn 1.22.22, 읽기 전용 웹 node_modules와 별도 쓰기 캐시 제공 확인.

이전 MVP worker는 종료했고 Node 23개 통과의 후보 patch만 남아 있다. 이번 worker는 노트 관련 부분만 참고하며 플래너/AI·현재 사용자 인증/Canvas 변경을 덮어쓰지 않는다. Markdown 데이터 형식·구형 소비자 보호·명시적 무손실 전환·초안 복구·탐색·summary/detail·테스트와 문서 갱신을 맡겼다.

## 제약과 후속 확인

Go 검증 도구 이미지를 준비하다 host 여유 공간이 부족해 일시 ENOSPC가 발생했다. 이번에 새로 받은 golang:1.23-bookworm 이미지만 제거해 공간을 복구했다. 추가 대용량 설치는 중단했다. 백그라운드 worker는 웹 lint/typecheck/build와 Node 검사를 실행하고 Go·필요한 Flyway·실제 브라우저 cloud 검증은 정확한 후속 명령과 함께 pending으로 남겨야 한다.

계획 문서 상대 링크와 git diff --check, private launcher bash -n, 실제 worker 시작과 도구 접근을 확인했다. 제품 구현 완료·후속 build 결과·원본 채택·배포는 아직 확인되지 않았다. 결과는 final.json·change.patch·metadata.txt에서 확인한다.

이번 응답은 계획·진단 및 비동기 구현 시작이다. 원본에는 문서/버그/보고서만 추가·정정했다. 문서 웹 반영은 구현 후보의 릴리스와 함께 추적하며 현재 backend 실행 산출물이 바뀌지 않아 새 배포하지 않았다. 후속 리뷰·원본 변경 확인·build/test 후 node scripts/deploy-cloud.mjs release canvas 및 release web(필요한 migration이 있으면 main 선행) 또는 실제 영향 대상의 release all로 staging부터 검증한다. 동일 소스가 통과하기 전 production으로 승격하지 않는다. 원본 자동 commit/push·메일·기존 timer 변경은 없다.
