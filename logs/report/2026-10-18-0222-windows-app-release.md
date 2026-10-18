# Flownote Windows 1.0.0 릴리즈

## 결과

Windows 10/11 x64 설치형과 포터블 앱을 제작하고 실제 Windows runner의 설치·실행 검증 후 공개했다. 웹·Android와 같은 계정과 서버 자료를 사용하며 인터넷 연결이 필요하다.

- 릴리즈: https://github.com/lunce0503/flownote-service/releases/tag/windows-v1.0.0
- 설치 EXE: https://github.com/lunce0503/flownote-service/releases/download/windows-v1.0.0/Flownote-Setup-1.0.0-x64.exe
- 포터블 ZIP: https://github.com/lunce0503/flownote-service/releases/download/windows-v1.0.0/Flownote-Portable-1.0.0-x64.zip
- 설치 안내: https://flownote-react.vercel.app/windows.html
- 공개 시각: `2026-10-18T02:21:53Z`
- 소스 commit: `a9c112dd0d1a69a62baefde4e2acd8d05e7f67a7`, main에 fast-forward 반영
- 태그: `windows-v1.0.0`

## 구현

`flownote-desktop/`에 Electron 44.9.0 앱과 electron-builder 26.15.3 패키징을 추가했다. 기존 `apps/host/`의 Remote Host와는 다른 Flownote 제품 UI 앱이다. 웹 기능을 복제하지 않고 같은 cloud 웹 화면·편집기·API를 실행한다.

- 아이보리·검정 테마와 기존 Flownote 웹 헤더 제거.
- `FlownoteDesktop/<version>` UA marker 및 설치 앱 공통 판별(`isInstalledApp`). 기존 Android 판별과 동작은 유지한다.
- 1000px 이상 창에서 왼쪽 탐색, 좁은 창에서 하단 탐색. 목록→상세 편집 흐름 및 전체 기능 메뉴 유지.
- Windows 편집 단축키·뒤로/앞으로·새로고침·확대/축소·전체 화면·native 파일 선택/저장.
- 현재 사용자 영역 NSIS 설치, 바탕 화면·시작 메뉴 바로가기. 포터블은 ZIP 전체를 압축 해제하고 실행한다.
- production 기본 프로필과 `--staging` 고정 프로필의 사용자 데이터/세션 분리.
- 연결 실패 재시도 화면, 단일 인스턴스 동작.

웹과 Android의 노트, 캔버스, 플래너 및 등록된 기능을 그대로 공유한다. 기존에 서버에서 중지되거나 개발 중인 기능의 상태도 웹과 같다. 완전 오프라인 앱, Windows ARM64 네이티브 빌드, Microsoft Store 등록은 이번 범위가 아니다.

## 보안

- renderer sandbox/contextIsolation/webSecurity 활성화.
- Node integration, preload/IPC bridge, webviewTag 비활성화.
- 내부 이동은 환경별 고정 HTTPS origin으로 제한하며 임의 URL override와 로컬 fallback을 제공하지 않는다.
- 외부 링크는 HTTPS/mailto/tel만 별도 브라우저/앱으로 전달한다.
- 파일 다운로드는 native 저장 대화상자를 사용하고 제안 파일명에서 경로·Windows 예약 이름을 정리한다.
- 서버 비밀값, 테스트 계정/세션, 사용자 업로드를 배포 파일에 포함하지 않는다.
- Windows 게시자 코드서명 인증서가 없어 최초 버전은 unsigned로 배포했다. Windows에서 알 수 없는 게시자 경고가 나타날 수 있으며 SHA-256을 함께 제공한다.

## 정적/단위 검증

- `cd flownote && yarn lint && yarn build`: 성공.
- `cd flownote-desktop && npm run check`: 문법 검사 및 정책 테스트 4개 성공.
- 테스트 범위: 고정 환경 선택, 정확한 HTTPS origin/credential 거부, 외부 protocol 제한, 다운로드 경로/Windows 예약 이름.
- `npm audit --omit=dev --audit-level=high`: 취약점 0개.
- 아이콘 생성 및 Windows 패키징 성공.
- `git diff --check`: 성공.

## Cloud staging과 production

`node scripts/deploy-cloud.mjs release web`으로 staging-first 배포했다. 공식 Playwright 브라우저 컨테이너에서 cloud 테스트 21개가 모두 통과했다(88.22초). 기존 Android·노트·캔버스·플래너·동기화 테스트와 Windows 창 크기 변경·헤더 제거·메뉴 포커스·세션 복원 검증을 포함한다.

- source fingerprint: `070416049c9ff2179b7c88dd46086bbf03c85a5d8cf14e3338be12fa17036d41`
- staging deployment: `dpl_BPKMS7nDg5yShhEYACRMCZ4pDtTp`, `READY`
- staging 검증: `2026-10-18T02:15:53.553Z`
- production deployment: `dpl_HdMhxeJ8aWSVxWRJe2A5vvCf6nq3`, `READY`
- production URL: https://flownote-react-91xy88knt-flownote-service.vercel.app
- production 배포: `2026-10-18T02:16:45.043Z`
- production smoke와 `/windows.html` HTTP 200 확인 성공.

백엔드 코드 변경이 없어 Railway 서비스 재배포는 하지 않았다. 배포 스크립트의 기존 환경별 공개 URL·Serverless 설정은 skip-deploys로 적용했다. 로컬 앱 서버·DB·Compose는 실행하지 않았다.

## 실제 Windows 검증

GitHub Actions의 Windows runner에서 생성한 NSIS 설치기를 실제 silent 설치한 뒤, 설치한 `Flownote.exe`를 `--staging`으로 실행했다. 같은 job의 portable ZIP도 압축 해제하고 그 실행 파일을 별도로 검증했다. Production 사용자 데이터로 테스트하지 않았다.

두 패키지 모두 다음 검증을 통과했다.

1. 스테이징 계정 로그인, 재로드 후 세션 유지.
2. 앱 테마, 웹 헤더 제거, 왼쪽 탐색 및 전체 기능 메뉴/키보드 Escape.
3. renderer에서 `window.require`/`window.process` 미노출, sandbox/contextIsolation/Node integration 실제 설정 확인.
4. 캔버스 그리기→실제 staging API 저장→재로드 후 선 복원.
5. blob 캘린더 파일의 native 다운로드 경로 저장 및 내용 확인.

- 사전 Windows 검증 run: https://github.com/lunce0503/flownote-service/actions/runs/39089334957 — success
- 릴리즈 태그 검증/공개 run: https://github.com/lunce0503/flownote-service/actions/runs/39089584660 — success
- main 통합 검증 run: https://github.com/lunce0503/flownote-service/actions/runs/39089585746 — success

릴리즈 job은 Windows job이 검증하고 업로드한 정확한 artifact를 받아 SHA-256 및 태그/패키지 버전 일치를 확인한 뒤 공개했다. Windows 실제 화면 캡처를 확인했으며 로컬 `.release/windows-screen-1.0.0/windows-home.png`에도 보관했다.

CI의 upload-artifact v4에는 Node 20 action runtime deprecation annotation이 있었지만 Node 24 강제 실행으로 성공했다. 이후 workflow 유지보수 때 action major 갱신을 검토한다.

## 공개 파일 검증

공개 파일 두 개를 다시 다운로드하고 릴리즈의 `SHA256SUMS.txt`로 검사해 모두 일치했다. 익명 HTTPS HEAD 요청도 두 파일 모두 HTTP 200이었다.

| 파일 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Flownote-Setup-1.0.0-x64.exe` | 111830441 | `c09dfef52d66f6d7feaa83c1ec81a40152eb4da74ddf28f3829429d0e747f455` |
| `Flownote-Portable-1.0.0-x64.zip` | 153453796 | `5b4a444d9fee1a3fc8a52cb7e441d70d757ba43e31dc7d2b38dd2203f47e1356` |

설치 EXE의 PE/Nullsoft 형식과 portable ZIP 형식을 추가 확인했다. 설치기의 32-bit NSIS stub은 정상이며 배포하는 Electron 앱 payload는 x64다.

## 운영과 롤백

웹 기능은 웹 배포와 함께 갱신되며 네이티브 기능/Chromium 업데이트는 새 Windows 패키지 버전으로 제공한다. 기존 설치 앱 프로필과 staging 프로필은 분리되어 있다. 이 최초 버전에는 자동 바이너리 업데이트를 구현하지 않았다.

웹 회귀는 Vercel 직전 성공 production 배포로 rollback한다. 네이티브 문제는 해당 버전 사용을 중단하고 수정된 새 버전을 배포한다. 첫 Windows 앱 릴리즈이므로 이전 Windows 앱 바이너리는 없다. 사용자의 실제 Windows PC 및 조직별 보안 정책에 따른 설치 검증은 추가 현장 확인 대상이다.
