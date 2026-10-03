# Remote Host 0.1.0 릴리스 결과

## 작업 범위

- 입력 보고서의 MVP 경계를 Linux 데스크톱 Host Agent로 구현했다.
- Android 클라이언트, 인터넷 릴레이, NAT 통과와 systemd 서비스는 이번 범위에서 제외했다.
- 원격 클라이언트는 Host 프로세스를 실행한 OS 사용자의 전체 셸 권한을 가지므로 LAN 또는 기존 VPN에서만 사용한다.

## 구현

- `apps/host/`: Node.js 20 이상 TypeScript CLI와 `node-pty` 기반 실제 PTY 호스트
- 명령: `doctor`, `init`, `serve`, `status`, `revoke`
- 통신: TLS 1.2 이상 WSS `/v1/connect`, Bearer 기기 토큰, JSON protocol v1
- 세션: 단일 클라이언트/PTY, 5분 재접속 유예, 최대 1 MiB 출력 재생, resize/close 지원
- 보안: 자체 서명 RSA 3072 인증서와 지문, 토큰 원문 미저장, scrypt 검증값, 인증 실패 제한, 사용자 전용 설정·제어 소켓
- 계약: `protocol/remote-host/v1/` JSON Schema와 예제
- 배포: GitHub 태그 기반 검증·패키징·릴리스 워크플로와 일반 사용자용 설치기

## 검증

- `npm run verify`: TypeScript 검사, 4개 테스트, 빌드 통과
- `npm audit --omit=dev --audit-level=high`: 취약점 0개
- 설치기 셸 구문과 버전 경로 우회 거부 확인
- 아카이브 SHA-256, 실행 권한, 프로덕션 의존성 설치, `node-pty` 로드 확인
- 압축 설치본으로 init, doctor, HTTPS `/health`, status, 정상 종료 확인
- 공개 GitHub 설치기로 별도 임시 prefix 설치, 버전과 doctor 확인
- 첫 공개 설치 시험은 로컬 루트 파일시스템 여유 공간 부족으로 실패했으며, 이번 작업의 임시 생성물만 정리한 뒤 동일 시험이 통과했다.

## GitHub 릴리스

- 커밋: `5e01c507a55dd125abfa47ef1bf5c72f769a393a`
- 태그: `remote-host-v0.1.0`
- 릴리스: `https://github.com/lunce0503/flownote-service/releases/tag/remote-host-v0.1.0`
- 자산: `install-remote-host.sh`, `remote-host-v0.1.0.tar.gz`, `remote-host-v0.1.0.tar.gz.sha256`
- SHA-256: `227334a94f1ad229566ca8ef24ad04a0a95a3d8b97e06a692d89eeccda3b7dca`
- GitHub Actions main 검증과 태그 verify/release 작업 통과
- Actions가 `checkout@v4`, `setup-node@v4`의 내부 Node.js 20 폐기 예정 경고를 표시했다. 현재 작업은 통과했으며 향후 action major 업데이트가 필요하다.

## 클라우드 배포

- 명령: `node scripts/deploy-cloud.mjs release web`
- staging: `https://flownote-react-staging-jkbotg1mu-flownote-service.vercel.app`
- staging cloud Playwright: 15개 통과
- production: `https://flownote-react-64nmncr3n-flownote-service.vercel.app`
- production smoke check 통과
- Remote Host는 사용자 PC에서 실행하는 제품이므로 Railway 서비스로 배포하지 않았다. 이번 변경에 백엔드 런타임 소스가 없어 Railway 재배포도 수행하지 않았다.
