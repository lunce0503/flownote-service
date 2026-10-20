# 접수 피드백 후보의 회귀 보완

## 증상과 원인

- 관성 후보는 mouse pointerup에서 포인터를 지운 뒤 pointerleave에서 membership guard로 반환해 움직임을 취소하지 못했다. 기존 자동 리뷰 재현 기록: `runs/20261014T013639Z-feedback-release-review-388650/final.json`.
- PDF 후보는 짧은 가로 화면에서 상하 45% 분할과 고정 컨트롤 때문에 PDF 표시 영역이 붕괴했다. 페이지 렌더 때 focused native button을 disabled로 바꾸어 포커스를 잃고 캔버스 단축키가 노출됐다. `runs/20261014T014038Z-feedback-release-review-390028/final.json`.
- 캔버스 높이의 고정 헤더 56px 가정과 320px 최소 렌더 높이는 실제 헤더 테두리·작은 분할 영역에서 입력 영역을 넘쳤다.
- 2026-10-18 첫 실제 staging E2E는 canvas의 intrinsic 크기 밖에 추가되는 1px border 두 면까지 검출했다. 데스크톱 경계 2px 겹침과 모바일 하단 1.5px 초과였다. 테두리 대신 크기를 늘리지 않는 inset 장식을 사용한다.
- 설정의 localStorage는 설정 페이지를 열어야 DOM에 적용돼 앱 새로고침/직접 편집기 진입에 반영되지 않았다. 삭제 전 확인 preference는 소비하는 코드가 없었다.

## 수정 방향

- 마우스 이탈/취소 시 membership 검사 전에 관성을 취소하고 터치의 정상 implicit leave는 유지한다.
- 짧은 가로 화면은 좌우 분할, 실제 visual viewport/헤더 하단으로 남은 높이 계산, 렌더 canvas 크기는 실제 영역 이하로 제한한다. PDF가 열리면 root touch-action을 해제하되 입력 canvas의 none은 유지하여 PDF 터치 스크롤을 허용한다.
- PDF 이동 버튼은 aria-disabled와 guarded handler로 포커스를 유지하며 loading/경계에서 no-op한다. 키보드는 PDF 안에서 격리한다.
- 지원하는 preference만 복원하고 앱 시작/다른 탭에도 적용한다. 미연결 삭제 옵션은 제거하고 안전한 보기 초기화를 제공한다.

검증 결과와 배포 영수증은 [접수 건 배포 보고서](../report/2026-10-18-0236-received-feedback-release.md)에 기록한다. 인증값·사용자 원본 파일은 보관하지 않는다.
