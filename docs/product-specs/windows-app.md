# Windows 설치 앱

`flownote-desktop/`의 Electron 앱이 환경별 공개 HTTPS 웹을 실행한다. 기존 웹과 편집기/API를 공유하고 Android와 같은 계정의 자료를 사용한다. 로컬 앱 서버·DB·LAN 연결은 필요 없다.

- Windows 10/11 x64 설치형 NSIS EXE와 portable ZIP을 제공한다.
- 최초 로그인 후 홈, 목록에서 상세 편집 화면으로 이동한다. 세션은 앱을 종료해도 사용자 프로필에 유지한다.
- `FlownoteDesktop/<version>` UA marker가 있는 앱에 아이보리·검정 테마를 적용하고 기존 Flownote 헤더를 제거한다. 넓은 창에서는 왼쪽 탐색, 1000px 미만에서는 하단 탐색을 제공한다.
- Android와 앱 탐색 및 기능 매니페스트를 공유한다. 일반 브라우저의 헤더·테마는 유지한다.
- 메뉴와 단축키로 뒤로/앞으로, 편집, 새로고침, 확대/축소, 전체 화면에 접근한다.
- 업로드는 Electron 기본 파일 선택기를, 내보내기는 native 저장 대화상자를 사용한다.
- 네트워크 실패 시 재시도 화면을 표시하며 기존 로그인/초안을 삭제하지 않는다. 완전 오프라인 작업은 보장하지 않는다.
- 기본은 production이며 `--staging`은 고정 staging origin과 분리된 사용자 프로필을 사용한다. 임의 URL 입력/CLI override는 제공하지 않는다.
- renderer sandbox/contextIsolation 활성화, Node integration/웹뷰/IPC bridge 비활성화, 외부 URL protocol 제한과 origin 고정을 유지한다.

검증은 웹의 cloud staging E2E와 Windows runner에서 실제 설치한 EXE 및 portable EXE의 staging 실행으로 구분한다. release 태그의 Windows 검증이 통과한 같은 artifact를 GitHub Release로 공개한다. 앱 UI·설치 안내는 `node scripts/deploy-cloud.mjs release web`으로 staging-first 배포한다. 설치 안내 `/windows.html` 및 release 파일명은 릴리즈 버전과 함께 갱신한다.

## 1.1.0 자동 업데이트

- 시작·절전 복귀·창 활성화 시 확인하며 자동 확인 최소 간격은 15분, 실행 중 주기는 1시간이다. 실패는 다음 확인 또는 도움말 메뉴에서 재시도한다.
- production/staging 고정 origin의 `/updates/<channel>/windows.json`을 읽는다. RSA SHA-256 서명 envelope와 채널·플랫폼·정확한 GitHub 저장소/tag/파일명·크기·SHA-256을 검증한다. 공개키는 앱에 고정하며 개인키는 저장소 밖에 둔다.
- 현재보다 높은 정식 `major.minor.patch`만 받는다. 확인된 최고 버전보다 낮은 feed는 차단한다. single-flight, `.part` 후 검증/rename, 재시작 시 캐시 해시 검증으로 중복 다운로드를 막는다.
- 도움말 메뉴에서 변경 내용, 진행/실패/준비 상태, 최근 확인·다운로드 이력을 확인한다. 진행률은 Windows 작업 표시줄에도 표시한다.
- NSIS 설치에만 `resources/installed-by-nsis` marker를 둔다. 설치형은 사용자가 저장을 확인하고 ‘종료하고 설치’를 누른 뒤 설치기를 실행한다. 무인/강제 교체하지 않는다.
- portable은 검증한 ZIP을 자동 다운로드하고 위치를 연다. 실행 중 디렉터리 자동 교체는 보장하지 않는다. 사용자가 새 폴더에 압축 해제한다. 로그인·초안은 기존 userData에 보존된다.
- 웹 renderer에는 업데이트 API/IPC/JS bridge를 추가하지 않는다. staging은 별도 userData와 feed를 사용한다.
- Windows Authenticode 게시자 서명은 여전히 없다. 업데이트 feed 서명은 Authenticode와 별개이며 최초 수동 설치는 배포 출처와 SHA256SUMS를 확인한다.
- 기존 1.0.0에는 updater가 없으므로 1.1.0은 한 번 수동 설치해야 한다.
