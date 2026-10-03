# Windows Remote Host 0.2.0 릴리스 결과

## 범위

- 기존 Linux Remote Host를 Windows 10/11 x64에서 실행할 수 있도록 확장했다.
- Windows PowerShell 설치기와 CMD 실행 링크를 GitHub Release에 추가했다.
- Android 클라이언트, 인터넷 릴레이와 상주 서비스는 이번 범위가 아니다.

## 구현

- 기본 설정: `%LOCALAPPDATA%\Flownote\RemoteHost`
- 기본 PTY: Windows PowerShell 5.1
- 인증서: OpenSSL 외부 실행을 제거하고 Node에서 RSA 3072/SHA-256 자체 서명 인증서를 생성
- 로컬 제어: 설정 경로별 Windows Named Pipe, 전체 사용자 읽기/쓰기 옵션 비활성화
- 권한: 설정 디렉터리·설정 파일·개인 키 ACL을 현재 사용자와 SYSTEM으로 제한
- 설치기: 숫자형 SemVer 제한, HTTPS 다운로드, SHA-256 및 압축 경로 검증, 사용자 영역 설치, 사용자 PATH 갱신
- 패키징: Linux와 Windows `tar` 및 실행 명령 차이를 처리

## 검증

- 로컬 Linux `npm run verify`: 타입 검사, 테스트 4개, 빌드 통과
- `npm audit --omit=dev --audit-level=high`: 취약점 0개
- Linux 패키지 생성과 SHA-256 확인 통과
- GitHub Actions `ubuntu-latest`: 전체 검증 통과
- GitHub Actions `windows-latest`: 인증서·ACL·WSS·PowerShell PTY·Named Pipe 통합 테스트 통과
- Windows runner에서 패키지 생성, PowerShell 설치기, 프로덕션 의존성 설치와 `remote-host.cmd version` 통과
- 첫 두 Windows 설치 스모크는 Node 24의 Windows `.cmd` 직접 실행 차이로 실패했다. 패키징을 현재 Node 프로세스의 TypeScript 컴파일러 직접 실행 방식으로 수정한 후 통과했다.

## GitHub 릴리스

- 최종 구현 커밋: `910b5c78e4e7d78417ac65f344fd917fb208115b`
- 태그: `remote-host-v0.2.0`
- 릴리스: `https://github.com/lunce0503/flownote-service/releases/tag/remote-host-v0.2.0`
- 자산: `install-remote-host.ps1`, `install-remote-host.sh`, `remote-host-v0.2.0.tar.gz`, `remote-host-v0.2.0.tar.gz.sha256`
- 아카이브 SHA-256: `323fce0fc7e1ff0a60ac0ce3b6e46132ef316203ae0a5b8ece9b26a77ad696a9`
- PowerShell 설치기 SHA-256: `b93bb529b3b51f5a755034e5ffcf26ab552a5e03652e9fce5d5e2f1eb6640e80`
- 공개 설치기와 저장소 설치기의 checksum 일치 확인

## 클라우드 배포

- 명령: `node scripts/deploy-cloud.mjs release web`
- staging: `https://flownote-react-staging-4xis6q9o5-flownote-service.vercel.app`
- staging cloud Playwright: 15개 통과
- production: `https://flownote-react-58k6mtnu1-flownote-service.vercel.app`
- production smoke check 통과
- Remote Host는 사용자 PC 프로세스이므로 Railway에 배포하지 않았다. 백엔드 런타임 변경도 없어 Railway 서비스 재배포는 생략했다.

## 중지와 롤백

- 문제 발생 시 실행 중인 `remote-host serve`를 종료하고 `%LOCALAPPDATA%\Flownote\RemoteHost`의 실행 링크를 사용하지 않는다.
- `remote-host-v0.1.0`은 Linux 전용 이전 릴리스로 유지한다. Windows는 `v0.2.0`이 최초 지원 버전이므로 별도 Windows 이전 버전은 없다.
