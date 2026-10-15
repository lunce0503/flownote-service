# Remote 모바일 IDE 검증 기록

- 로컬 브라우저는 libatk/atspi/Xdamage 공유 라이브러리가 없어 시작하지 못했다. OS 설치/앱 서버 실행 없이 Ubuntu 패키지 208kB를 `/tmp`에 추출해 테스트 프로세스의 라이브러리 경로로만 사용했다. 실제 CodeMirror의 한글/CRLF/undo·redo/탭/검색·바꾸기/출처·PC 격리와 4개 뷰포트 시험이 통과했다. CI는 Playwright의 공식 런타임 설치를 사용한다.
- Host CI `38692505678`: Linux 10개 성공. Windows는 기존 PTY/QR은 성공하고 파일 저장 2개가 일반 파일 오류로 실패했다. HTTP 응답/일반 UI에는 내부 정보를 노출하지 않고 예외의 내부 cause만 보존해 CI에서 Windows 파일 접근/ACL 실패 지점을 확인한다. 검증 전에는 Windows 저장 완료로 표시하지 않는다.
