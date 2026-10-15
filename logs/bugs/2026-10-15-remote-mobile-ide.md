# Remote 모바일 IDE 검증 기록

- 로컬 브라우저는 libatk/atspi/Xdamage 공유 라이브러리가 없어 시작하지 못했다. OS 설치/앱 서버 실행 없이 Ubuntu 패키지 208kB를 `/tmp`에 추출해 테스트 프로세스의 라이브러리 경로로만 사용했다. 실제 CodeMirror의 한글/CRLF/undo·redo/탭/검색·바꾸기/출처·PC 격리와 4개 뷰포트 시험이 통과했다. CI는 Playwright의 공식 런타임 설치를 사용한다.
- Host CI `38692505678`: Linux 10개 성공. Windows는 기존 PTY/QR은 성공하고 파일 저장 2개가 일반 파일 오류로 실패했다. HTTP 응답/일반 UI에는 내부 정보를 노출하지 않고 예외의 내부 cause만 보존해 CI에서 Windows 파일 접근/ACL 실패 지점을 확인한다. 검증 전에는 Windows 저장 완료로 표시하지 않는다.
- Host CI `38692702778`: 내부 cause에서 Windows PowerShell이 `Microsoft.PowerShell.Security` 모듈을 불러오지 못한 것이 확인됐다. PowerShell 7에서 상속한 PSModulePath를 그대로 Windows PowerShell에 전달하지 않고 OS 기본 Modules 경로만 사용한다. 파일 내용 쓰기 전에 기존 ACL을 복사하는 보호는 유지하고 private ACL의 저장 전후 동일성을 시험에 추가한다.
- Android CI `38692505828`: 빌드/JVM/브라우저는 성공했지만 실제 WebView에서 편집기가 비었다. 파일 탭·내용 로딩은 됐으나 네이티브 postWebMessage의 빈 source origin을 새 JS가 거부했다. 고정 appassets 목적지로 전달하는 기존 터미널 규칙에 맞춰 origin-scoped NativeEditor가 있는 경우의 빈 출처만 허용하고 외부 출처 거부 시험을 유지한다. 브라우저 시험에 빈 native 출처를 추가하고 실제 Android에서 다시 확인한다. 로드/JS 오류는 내용/경로를 출력하지 않고 일반 편집기 오류로 표시한다.
- 커서 표시 검토: load/setState 동안 change 이벤트를 억제해 새 파일의 줄·열도 이전 값에 머물 수 있었다. load 완료 시 실제 선택 위치를 명시적으로 보내고 브라우저의 파일 전환 및 Android의 다시 불러오기에서 Ln 1/Col 1을 검증한다.
