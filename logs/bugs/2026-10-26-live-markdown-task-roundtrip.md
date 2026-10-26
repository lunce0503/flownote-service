# 체크리스트 뒤 Markdown 재로드 누락

2026-10-26 Asia/Seoul staging E2E에서 체크리스트 뒤 입력한 제목·굵은 글씨·한글은 서버 원문에 저장됐으나 재로드 시 빈 블록으로 나타났다. Tiptap 3.20 MarkdownManager의 taskList tokenizer가 helper lexer를 사용하면서 marked 공유 tokenizer의 대상을 바꿔 이후 inline token 배열을 비워 두는 것이 원인이다.

편집기별 Marked 인스턴스를 사용하고 block lexing 후 내용이 있으나 inline token 배열이 비어 있는 paragraph/heading/text만 다시 토큰화한다. 서버 원문과 저장 계약은 유지한다. 단위 검사는 체크리스트 checked 상태와 뒤 제목·굵은 글씨·한글 보존을 함께 확인한다. 실제 staging live Markdown/IME/reload E2E 전체 통과 전에는 운영 완료로 표시하지 않는다.

동시에 발견한 파일 생성 실패 알림 누락은 목록 재조회가 오류를 지우기 때문이었다. 목록 복원 후 오류를 표시하도록 순서를 수정했다. 기존 E2E의 통합 목록 heading 및 노트 전환 완료 대기와 테스트 간 drawing 의존성도 정정한다.
