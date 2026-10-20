# 설계 문서 색인

이 디렉터리는 장기 아키텍처 결정과 설계 문서를 둔다. 최상위 시스템 맵은 `docs/DESIGN.md`를 기준으로 하고, 도메인별 깊은 설계가 필요할 때 이곳에 파일을 추가한다.

## 현재 참조 문서

- [게시글 Markdown·탐색 사이드바·로딩 개선](blog/markdown-workspace-plan.md): Markdown 원문, 레거시 보존, 폴더 트리, Canvas 방식의 목록·본문 분리.

- [노트 저장·화면 이동 복구 계획](blog/note-save-recovery-plan.md): 미저장 초안 보존·복구·계정 격리.
- [노트 메타 목록·단건 조회 분리 계획](blog/note-query-split-plan.md): 본문 전체 읽기 제거와 API 호환.
- [플래너 동시 편집 충돌 방지 계획](planner/concurrent-edit-plan.md): 버전 조건부 저장과 캔버스 일정 추가.
- [AI 가용성·메뉴·오류 정합성 계획](agent/capability-ui-plan.md): 중지 상태와 사용자 진입점 일치.

- `docs/design-docs/canvas/canvas.md`: Canvas 목록, 편집, 저장, 실시간 통신 코드맵과 상태 불변식.
- `docs/design-docs/blog/blog.md`: Blog 목록, BlockNote 편집, revision 저장과 폴더 관리 코드맵.
- `docs/DESIGN.md`: 하위 프로젝트, 서비스 경계, 데이터 소유권.
- `docs/HARNESS.md`: Codex 하네스 운영 모델.
- `docs/generated/db-schema.md`: PostgreSQL 스키마 참조.
- `docs/product-specs/mobile-was-architecture.md`: Expo 네이티브 앱과 Railway 웹 테스트 구조.
- `docs/DEPLOYMENT.md`: Vercel/Railway 배포와 롤백 운영 기준.

## 새 설계 문서 작성 기준

새 설계 문서는 다음 중 하나를 만족할 때 만든다.

- 여러 하위 프로젝트가 영향을 받는다.
- API, DB, UI 계약이 함께 바뀐다.
- 운영 방식이나 배포 절차가 달라진다.
- 나중에 같은 결정을 반복하지 않도록 근거가 필요하다.

## 템플릿

```md
# 제목

## 배경

## 결정

## 영향

## 검증
```

- [캔버스·노트 작업 공간 디자인](canvas/workspace-explorer-design.md): 공통 베이지/흰색/검정 팔레트, 폴더 탐색기와 제품 명칭.
