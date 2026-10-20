# 게시글 Markdown 작업 공간과 로딩 개선

상태: 완료. 운영 반영 2026-10-19T14:36:15.036Z. 사용자 후속 요청 “배포까지 완료해줘”에 따라 신뢰 host에서 최종 채택·검증·운영 배포를 마쳤다.

## 목표와 범위

Markdown 원문 편집과 Canvas 스타일의 간결한 작업 공간, Windows 탐색기 형태의 category/folder/note 사이드바, 메타 목록 → 선택 본문 로딩을 구현한다. 관련 프로젝트는 flownote, flownote-canvas와 최소 호환 소비자 flownote-mobile/flownote-ai다. 이미 배포된 인증·Canvas/PDF 변경은 보존한다.

제품 기준은 [Markdown 작업 공간](../../product-specs/blog-markdown-workspace.md), 기능별 상세 설계는 [Markdown·탐색 계획](../../design-docs/blog/markdown-workspace-plan.md), [저장 복구](../../design-docs/blog/note-save-recovery-plan.md), [조회 분리](../../design-docs/blog/note-query-split-plan.md)를 따른다.

## 실행 체크리스트

- [x] N개 본문의 순차 R2 조회·단건의 전체 목록 조회·React 수동 청크의 BlockNote 포함 경로 재현.
- [x] 형식이 명시된 Markdown·서버 소유 legacy 원본 보존·구형 소비자 보호·revision CAS 구현.
- [x] summary 페이지/단건 detail API와 사용자 소유권·안정된 cursor 계약, 기존 full-list 호환 유지.
- [x] Markdown 편집·미리보기·나란히·.md 내보내기, 트리 파일/폴더 CRUD·반응형·키보드 구현.
- [x] IndexedDB 초안·지연 저장·최신 ack/rebase·계정 전환·실제 충돌과 부분 장애 복구 구현.
- [x] 백그라운드 최종 patch 리뷰, 원본 기존 변경의 기준 일치 확인 후 관련 변경만 채택.
- [x] 웹 기본 verify·21개 모델 테스트·bundle graph·Go 모든 패키지·모바일 전체 verify·AI 4개 테스트 통과.
- [x] staging 브라우저 E2E 47/47, 390/820/1440px·추가 화면 리뷰·성능 측정 완료.
- [x] `node scripts/deploy-cloud.mjs release blog`로 동일 소스 production 배포, ID/상태·공개 smoke 재확인.

## 결정과 검증 근거

- 새 데이터베이스 migration 없이 기존 JSONB에 형식 표식을 저장한다. legacy 전환은 명시적이며 전체 원본은 서버가 보관한다. 구형 배열로 Markdown을 덮어쓸 수 없다.
- 첫 metadata 페이지를 즉시 표시하고 후속 페이지는 취소/세대 경계를 지킨다. 본문은 선택 시에만 읽으며 오류를 빈 문서로 대체하지 않는다.
- React package root와 공용 interop helper만 수동 청크로 고정한다. explicit/editor 수동 청크의 순환을 제거했다. 초기 앱/Blog에서 무거운 편집기·preview·KaTeX를 기다리지 않는다.
- 실제 409는 sync event 없이도 자동 저장을 중지하고 서버본과 초안을 확인한 뒤 복구한다. quota 실패를 기기에 저장됐다고 표시하지 않는다.
- 운영 배포 대상은 canvas/web이다. Spring/gateway/serve는 기존 배포 소스, MCP/Expo는 중지 상태를 유지한다. 임의 깊이 폴더·플래너 동시 수정·AI 가용성 전체 개선은 별도 범위다.

동일 staging 합성 Markdown 노트 5개(약6KB)/Canvas5개, 5회 교대 warm API 중앙값: full-list 594ms/31,242 bytes, summary 180ms/892 bytes, Canvas182ms/827 bytes, detail266ms/6,248 bytes. 운영·전체 브라우저 수치가 아니며 측정 자산10개 삭제 확인. 초기 별도 BlockNote fixture의 full-list954ms/Canvas201ms와는 직접 개선율을 계산하지 않는다.

## 백그라운드와 채택 기록

실행 `20261019T135243Z-blog-markdown`, 기준 commit `21d2d9441c5338cbd2c9cd7394fd580715b1faaf`, snapshot `7ad26f76b333d278ea3b6a7378e7247d546b2382`, 파일924개. worker는 후보 생성 후 action_required로 종료했다. 신뢰 host가 최종 patch를 재구성해 late 변경을 리뷰하고 39개 관련 소스·테스트만 채택했다. 이전 MVP 전체 후보는 합치지 않았다. 자동 commit/push는 하지 않았다.

상세 검증·배포 ID·실패와 수정·남은 한계는 [최종 보고서](../../../logs/report/2026-10-19-1438-blog-markdown-release.md)에 기록했다. fingerprint `4df8bdb066b03cc059d781ccf4857e281ff253313a4d525f9985b6a689c7be6e`의 staging과 production receipt가 일치한다.
