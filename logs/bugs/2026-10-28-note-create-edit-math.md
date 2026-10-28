# 노트 생성·한 줄 편집·수식 입력

## 증상과 재현

- 새 노트를 눌러도 문서가 추가되지 않는다. 두 생성 호출부가 window.prompt 결과가 없으면 API 호출 전에 종료한다. Electron에는 prompt가 지원되지 않으며 Android WebChromeClient는 onJsPrompt를 제공하지 않는다.
- 기존 staging에서 Windows 앱 표식과 prompt가 없는 환경으로 실제 버튼을 클릭한 회귀 검사는 /blog에 남아 URL 검사를 실패했다. `/tmp/flownote-note-red2.log`. 최초 시도는 staging 회원 생성 일시 실패로 기능에 도달하지 못했으므로 재현 증거와 구분한다.
- 설치된 Tiptap 3.20 수식 입력 규칙은 인라인 `$$...$$`, 블록 `$$$...$$$`이며 저장 Markdown 구분자는 각각 `$`/`$$`라 입력과 재로드 행동이 다르다. 기존 inline 규칙이 수식 앞 문자까지 교체하는 경계도 수정 대상이다.
- Windows 한 줄 문제의 정확한 사용자 증상은 비동기 질문 중이다. 중간 삽입·선택 교체·한글 조합·Home/End·삭제·줄 추가·undo/redo·저장을 완료 기준으로 유지한다. 현재 React prop 동기화는 직전 emit과만 비교해 더 늦은 이전 입력 echo가 현재 편집 문서/선택을 되돌릴 수 있으므로 이를 방지한다. 이 경로는 순수 회귀 검사로 확인하며 Windows 실제 동작 검증과 구분한다.

## 수정

새 노트는 바로 생성하고 제목을 선택해 수정한다. 폴더 배치만 실패하면 생성된 원본을 열고 미분류 안내를 보여준다. 아이콘과 접힘 도구·세로 세 점 설정, HTML 수식 입력창과 추천 명령어를 제공한다. 인라인/여러 줄 수식을 요청 구분자로 변환하고 줄과 수식 앞 문자를 보존한다. 자체 입력 echo를 재적용하지 않고 IME 조합 중 문서 재설정/중간 저장을 피하며 조합 종료 후 최종 입력을 보관한다.

## 검증 진행

수식/동기화 모델4개 통과. 서버 없이 독립 ProseMirror 인메모리 브라우저 검사에서 실제 키 입력의 단일 `$`, 여러 줄 `$$`, 앞 문자 보존·Markdown 직렬화/재파싱 통과(`/tmp/flownote-note-math-browser-unit.log`). 프런트 verify 통과. 새 생성/아이콘/한 줄/수식의 Chromium1440·390/WebKit820 실제 staging 시나리오12개를 추가했다. 이 변경의 실제 cloud/native/production은 아직 검증 전이다. 이전116개 gate를 이번 완료로 사용하지 않는다.

추가 인메모리 React/Tiptap 실제 키 검사에서 한 줄 중간 삽입·undo/redo·CDP 한글 조합·추천 Tab 삽입/괄호 내부 커서·수식창 클릭 삽입이 모두 통과했다(`/tmp/flownote-note-react-final.log`). 추천 선택 후 textarea 값이 암묵적 label 이름에 포함되는 접근성 문제는 분리된 htmlFor/id로 고쳤다. 이 검사는 실제 클라우드·Windows 설치본 검증의 대체물이 아니다.

## 2026-10-29 통합 검증에서 확인한 사항

- 이전 staging의 Chromium1440 빠른 Home/ArrowRight6/중간 입력에서 간헐적으로 끝에 입력되는 실패를 확인했다. 계측 대기를 넣은 대조군 및 별도12회 stress는 정상이다. 따라서 특정 원인을 확정하지 않는다. Tiptap `useEditor`가 매 React 렌더에서 새 extension/editorProps/content를 받아 `setOptions`로 view를 재설정하던 불필요한 경로를 줄였다. mount 동안 options/extension/editorProps/event handler/초기 content를 고정하고 최신 콜백·editor·disabled는 layout effect의 ref로 읽는다. 실제 외부 변경은 기존 sync effect만 적용하며 editable도 실제 변경 때만 설정한다. configure가 보관하는 event callback의 ref 읽기를 초기화 함수 실행으로 간주하는 lint 보수 분석은 해당 한 줄만 명시했고 실제 render에서 ref를 읽거나 쓰지 않는다.
- 새 노트 생성의 새 URL 대기, 폴더 메타 로딩 중 열림 상태 확인, LaTeX backslash의 CSS escape, route 교체 뒤 새 본문 로드 전에 접힌 도구를 검사하는 테스트 동기화 결함을 고쳤다. 각 동작의 실제 assert는 보존했다. note-document의 현재 id를 표시해 본문이 현재 URL에 맞게 로드됐는지 확인한다. 빠른 Home/undo/redo는 세 번 반복하며 다단계 조합은 최종 compositionend1회와 정확한 한글 문자열을 검사한다.
- Android의 강제 화면 키보드 설정1에서는 React가 없는 일반 contenteditable도 CDP 조합 단계 사이에서 원치 않는 종료·재시작과 중복 글자를 보였다(`/tmp/flownote-note-ime-transport-audit.log`). 동일 장치에서 hardware IME 모드 설정0은 한→한글→최종입력과 compositionend1회를 정확히 처리했다(`/tmp/flownote-note-ime-hardware-mode.log`). native harness는 이 에뮬레이터 설정을 통제하고 종료 시 복원한다. 이를 앱의 React 문제 수정 증거나 물리 Gboard 검증으로 과장하지 않는다.
- Windows40709765677은 노트 검사 전에 기존 Reader 사전 결과 대기에서 실패했다. staging 실제 lookup503과 공식 Gemini API402 `RESOURCE_EXHAUSTED`(선불 credits depleted)를 확인했다(`/tmp/flownote-note-translation-provider-status.log`). 키·모델 유무와 실제 오류만 로그에 남겼다. 결제/키/유료 계정을 자동 변경하지 않았으며 사전 검사를 skip/mock하지 않는다. 노트 검사를 Reader보다 먼저 실행해 별도 결과를 확보한다. provider 회복 후 최종 전체128개 통과 전 production 승격은 보류한다.
