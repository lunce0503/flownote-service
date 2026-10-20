# 설치 앱의 PDF 닫기 버튼 겹침

- 증상: iOS installed-app UA의 WebKit PDF 추가 시험에서 페이지 전환·캔버스 저장은 동작했지만 PDF 닫기가 90초 timeout으로 실패했다. 모바일에서는 PDF를 열기 전 ‘파일 동작’ 버튼도 같은 링크에 가려졌다. Playwright hit-test는 `.android-editor-library` 링크가 버튼을 가로챈다고 보고했다.
- 원인: 모든 설치 앱의 캔버스 목록 복귀 링크가 viewport 우측 상단 z-index 800으로 고정되어 PDF reader의 같은 위치 닫기 버튼을 덮었다. 기존 PDF 테스트는 브라우저 UA만 사용해 설치 앱 overlay를 만들지 않았다.
- 수정: 목록 복귀 링크를 상단 파일 툴바와 겹치지 않는 우측 하단(bottom 72px)으로 옮기고 reader가 열린 설치 앱에서만 숨긴다. reader를 닫으면 복원한다. 메뉴/캔버스/서버 저장 경로는 바꾸지 않는다.
- 회귀: iOS WebKit project에 기존 desktop/mobile PDF suite를 포함하고 reader가 열렸을 때 목록 링크 숨김, 닫은 후 복원을 추가 검사한다. 새 총 gate는 65개다. 실패 테스트를 강제 클릭/skip으로 약화하지 않는다.
- 배포: 웹 전용 수정이므로 EAS IPA 1.1.0(4)를 재빌드하지 않는다. 새 web snapshot을 staging부터 검증한 후 같은 소스를 production에 반영한다. 실제 iPad 시스템 파일 선택/Pencil 검증은 별개다.
