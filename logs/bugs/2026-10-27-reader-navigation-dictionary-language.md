# 책 읽기 조작과 한국어 사전 부재

증상: 휠/스페이스/스와이프로 책을 넘길 수 없고 한 쪽만 표시한다. 읽기 도구를 숨길 때 레이아웃이 달라지고, 선택 사전이 영어 뜻만 표시한다.

원인: BookReader가 버튼·좌우 화살표만 처리하고 PDF canvas/text layer 한 개만 렌더링했다. 사전은 Wiktionary 원문 정의를 그대로 표시했고 처음 품사의 뜻만 제한까지 채웠다.

수정: 독립 페이지 렌더와 읽기 navigation/spread 모델, 안정된 viewport의 겹침형 제어, 페이지별 선택/사전 기록, 품사별 복수 뜻 추출과 공식 Gemini 한국어 번역/검증·캐시를 추가한다. 기존 수동 메모는 명시적 갱신 전까지 보존한다.

검증: 순수 모델·Go 번역/provider schema·프런트 build와 실제 staging 휠/키/손가락/텍스트 드래그/두 쪽·한국어 복수 뜻·저장 및 전체 회귀 검증으로 마무리한다. 최초 단위 검사는 미구현 모델/타입으로 실패한 뒤 구현을 추가해 통과했다. 자세한 단계와 실제 배포 상태는 [실행 계획](../../docs/exec-plan/active/2026-10-27-library-reader-korean.md)을 따른다.

앱 관리 실제 화면 검토: 390px/820px에서 겹침형 상단 도구가 PDF 첫 줄을 가려 실제 드래그가 실패했다. 안정된 상단 여백을 확보하고, 44px 터치 영역을 유지하면서 작은 화면의 중복 설정은 More 메뉴로 모았다. 선택 검색 버튼은 ResizeObserver로 측정한 툴바 높이 위에 12px 간격을 둔다. 도구를 표시한 실제 드래그 후 두 사각형의 비겹침과 44px/overflow를 기존 핵심 시나리오에 추가했다. Playwright mobile WebKit은 mouse.wheel API를 지원하지 않아 해당 엔진은 DOM wheel smoke로 구분하며 Chromium 실제 wheel/터치와 모든 기능 assertion은 유지한다.

Android 실제 WebView 추가 측정: innerHeight=867, document/body scrollHeight=943, App 및 textbook-library padding-bottom이 각각76px였다. 읽기 전용 wrapper에만 책장 padding/min-height를 해제하고 기존 앱 shell-offset으로 읽기 높이를 정한다. 목록 여백과 PDF 내부 auto 스크롤은 유지하며 외부 문서 높이 회귀를 검사한다.
