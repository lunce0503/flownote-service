# Flownote Windows

Windows 10/11 x64의 Electron 설치 앱. 기존 웹 기능·편집기·cloud API를 공유하며 인터넷 연결이 필요하다. Android와 같은 계정으로 자료를 동기화한다. PC에서 앱 서버나 DB를 실행하지 않는다.

## 개발과 검증

Node.js 24 이상을 사용한다.

```bash
npm ci
npm run check
npm run icons
npm run start:staging
```

Production은 `npm start`, staging은 `--staging` 인자를 사용한다. 임의 URL 환경 변수나 loopback fallback은 제공하지 않는다. Production과 staging은 별도 userData 디렉터리(`Flownote`, `Flownote-Staging`)를 사용한다.

## Windows 릴리즈

```bash
npm run package:win
npm run smoke -- <설치한-Flownote.exe-경로>
```

`release/`에 NSIS 설치기, portable ZIP, SHA256SUMS를 만든다. Windows 설치기는 사용자 영역 설치이며 관리자 권한 상승을 요구하지 않는다. `--staging`은 동일 패키지를 실제 cloud staging에서 검증하는 고정 프로필이다.

`.github/workflows/windows-app.yml`은 Windows runner에서 설치 및 portable 실행, sandbox·로그인·세션·캔버스 저장/재조회·파일 내보내기를 확인한다. `windows-v<version>` 태그는 같은 job에서 검증한 정확한 파일을 GitHub Release로 공개한다. 게시자 코드서명 인증서가 없어 최초 버전은 unsigned로 배포한다. 검사에서 다운로드한 사용자 자료·세션은 artifact에 넣지 않는다.

앱 전용 UI와 설치 안내는 `node scripts/deploy-cloud.mjs release web`으로 staging-first 배포한다. 네이티브 바이너리는 GitHub Release, 설치 안내는 `/windows.html`에서 제공한다.

## 보안

웹 renderer에는 Node.js, preload/IPC bridge, webviewTag를 노출하지 않는다. sandbox/contextIsolation/webSecurity를 활성화하고 내부 이동은 환경별 고정 HTTPS origin에 제한한다. 외부 링크는 HTTPS/mailto/tel만 허용하며 시스템 브라우저로 연다. 파일 다운로드는 native 저장 대화상자를 사용한다. 서명키·서버 credential·테스트 계정을 패키지에 넣지 않는다.
