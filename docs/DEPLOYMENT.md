# 클라우드 배포 운영 기준

## 환경

2026-09-09부터 PC 내부망, loopback API, Compose 통합 실행을 폐기한다. 클라이언트는 공개 HTTPS gateway만 호출한다. Railway 안의 서비스·DB·Redis 간 private DNS 통신은 외부 공개하지 않고 유지한다.

| 구분 | 스테이징 | 프로덕션 |
| --- | --- | --- |
| 웹 | https://flownote-react-staging.vercel.app | https://flownote-react.vercel.app |
| Gateway | https://flownote-api-staging.up.railway.app | https://flownote-api-production.up.railway.app |
| 모바일 웹 | https://flownote-mobile-staging.up.railway.app | https://flownote-mobile-production-production.up.railway.app |
| Railway environment | staging | production |
| Vercel project | flownote-react-staging | flownote-react |

정확한 project/environment ID는 `scripts/cloud-environments.json`이 소유한다. 별도 Vercel 프로젝트이므로 스테이징 프로젝트에서도 `--prod`는 스테이징 도메인에만 배포한다. 두 환경의 PostgreSQL·Redis는 환경 단위로 격리하며 객체 저장소 bucket도 분리한다. 데이터 복제나 초기화는 이 배포 절차에 포함하지 않는다.

## 배포 순서

Windows 앱은 `flownote-desktop/`와 `.github/workflows/windows-app.yml`이 소유한다. Windows runner에서 NSIS 설치 및 portable 실행을 staging에서 검증하고 `windows-v*` 태그의 검증된 artifact를 GitHub Release로 공개한다. 웹 앱 외관과 `/windows.html` 안내는 `release web`으로 배포한다. 최초 릴리즈는 Windows 게시자 인증서 없이 배포하며 SHA-256을 제공한다.

Android 설치 APK는 `flownote-android/`에서 서명 빌드하고 `flownote/public/downloads/`에 배치한 뒤 `release web`의 staging 검증과 production 배포로 전달한다. `/android.html`이 설치 안내다. Debug는 staging, release는 production HTTPS 웹에 연결하며 빌드·키 관리 기준은 `flownote-android/README.md`를 따른다.

### Windows·Android 업데이트 feed (1.1.0 이상, 현재 1.2.0)

앱 바이너리와 웹 기능 배포는 구분한다. 웹은 고정 cloud origin에서 공유하며 네이티브 셸은 서명된 `/updates/<channel>/<platform>.json`으로 새 버전을 자동 다운로드한다. 1.2.0은 오프라인 재동기화 웹 기능을 공통 제공하고 iOS에는 Pencil native bridge를 추가한다. Windows NSIS와 Android APK는 설치 확인이 필요하고 portable ZIP은 수동 압축 해제가 필요하다. Android 1.1.0, Windows 1.1.1 이전 버전은 각 기준 버전을 한 번 직접 설치해야 updater 경로를 사용할 수 있다.

1. 앱 버전/versionCode를 증가시키고 빌드·단위·서명 검증한다. Windows runner에서 실제 NSIS 설치/portable staging smoke가 통과한 정확한 artifact만 릴리스한다.
2. Android APK는 기존 운영 서명키를 사용한다. debug는 `-staging.apk`, production은 `.apk`로 분리한다. 기존 설치와 서명 인증서가 같은지 확인한다.
3. 저장소 밖 RSA 개인키 경로 `FLOWNOTE_UPDATE_SIGNING_KEY`를 사용해 `scripts/sign-app-update.mjs`로 양 채널 feed를 생성한다. 앱에는 공개키만 포함한다. 버전·채널·플랫폼·변경 내용·정확한 URL·크기·SHA-256을 서명한다.
4. `node scripts/deploy-cloud.mjs staging web`으로 staging 배포·전체 cloud E2E를 실행한다. Windows workflow의 `verify_updates=true`와 Android 이전 debug 버전으로 실제 다운로드·캐시·설치 전달을 검사한다. staging 시험은 production 앱/데이터를 사용하지 않는다.
5. 같은 소스의 통과 receipt를 확인하고 `node scripts/deploy-cloud.mjs production web`으로 승격한다. 단일 실행은 `release web`이다. 바이너리/feed가 바뀌면 staging부터 다시 검증한다.
6. 양 환경 feed의 서명·채널, 실제 다운로드 URL·SHA-256, 공개 릴리스의 버전 일치와 production health를 read-back한다. APK 서명과 feed 서명은 별개다. Windows Authenticode가 없는 경우 제한을 안내한다.

낮은 feed 버전으로 native rollback하는 것은 차단된다. 문제가 있는 native 릴리스는 더 높은 수정 버전으로 배포한다. 웹 문제는 이전 Vercel Ready 배포로 복구한다. 앱 데이터·서명키·인증 세션은 삭제하지 않는다.

Node.js 24 이상, 인증된 Railway/Vercel CLI, 프로젝트 의존성이 필요하다.

```bash
scripts/verify-services.sh all
node scripts/deploy-cloud.mjs release all
```

대상은 `all|feedback|blog|main|canvas|serve|ai|api|mobile|expo|web`이다. `feedback`은 프로필·캔버스 피드백 반영에 필요한 main과 web을 함께 스테이징 검증한 뒤 같은 소스로 배포한다. `blog`는 Notes API를 소유하는 canvas와 web을 한 소스로 스테이징 배포·전체 E2E한 뒤 같은 소스로 운영에 승격한다. 게시글 전용 변경은 `node scripts/deploy-cloud.mjs release blog`를 사용하며 관련 없는 인증·일정 서비스를 재배포하지 않는다. `all`은 production에서 가동 중인 main, canvas, serve, api, web만 배포한다. production에서 중지된 AI, 모바일 정적 웹, Expo Go는 staging에서도 기본적으로 중지하며 필요할 때만 명시적인 단일 대상을 배포한다. 기존 `scripts/deploy-production.sh <target>`도 같은 staging-first release를 실행한다.

피드백 신뢰 컨트롤러는 `feedback-auto` 대상과 고정 정책이 계산한 `FLOWNOTE_RELEASE_TARGETS`를 사용한다. `FLOWNOTE_RELEASE_SOURCE_ROOT`의 격리 snapshot을 배포하되 cloud profile·설정·배포 스크립트는 관리 저장소의 신뢰된 파일을 사용한다. `FLOWNOTE_RELEASE_GUARD_ROOT/FINGERPRINT`는 staging 검증 중 원래 개발 소스가 바뀌었을 때 production을 차단한다. 모델 자체에는 이 배포 환경이나 credential을 전달하지 않는다. 일반 수동 release의 기본 root와 순서는 바뀌지 않는다.

1. 정적 분석·빌드·인메모리 단위 테스트를 실행한다. 로컬 앱/DB 네트워크는 실행하지 않는다.
2. 모든 배포에서 `configure-cloud.mjs`로 해당 환경의 공개·서비스 URL, Spring 메모리/연결 풀, 환경별 Serverless 정책을 설정한다. 비밀값과 DB/스토리지 설정은 덮어쓰지 않는다.
3. Railway에 Dockerfile 소스를 배포하고 반환된 정확한 deployment ID의 SUCCESS를 기다린다.
4. Vercel에는 해당 환경의 gateway URL을 명시한 번들을 배포한다.
5. 실제 스테이징 웹과 API에서 로그인, 캔버스 저장/재조회, 큰 저장·중복 mutation, 모바일 설정, 반응형 화면을 검증한다.
6. `.release/staging-<target>.json`에 소스 SHA-256, 배포 ID, 검증 시각을 기록한다. 이 파일은 인증값을 포함하지 않으며 git에서 제외한다.
7. 같은 소스의 24시간 이내 통과 기록이 있어야 production을 배포한다. 소스 변경 또는 테스트 실패 시 중단한다.

단계를 나누어 실행할 수도 있다.

```bash
node scripts/deploy-cloud.mjs staging all
node scripts/deploy-cloud.mjs production all
```

관측 타임아웃은 배포 실패를 의미하지 않는다. 출력된 ID의 Railway 상태를 먼저 확인하고 진행 중이면 같은 배포를 계속 관찰한다. 다시 업로드해서 중복 배포하지 않는다.

### 인증 변경 배포

웹의 `/web-api/**`는 같은 환경의 공개 gateway로 프록시한다. `deployWeb`은 환경별 Vercel 설정을 `.release/vercel-<environment>.json`에 생성하므로 staging이 production 인증으로 연결되지 않는다. 웹은 HttpOnly 쿠키와 동일 출처 Socket.IO polling을 사용하며 프록시 경로에는 끝 슬래시를 추가하지 않는다.

세션 검증 변경은 main·canvas·serve·api·web을 함께 `release all`로 검증한다. 신규 cloud 인증 시험은 쿠키 비노출·CSRF·현재/전체 로그아웃·세 서비스 폐기 토큰 거부·비밀번호 입력·로그인 제한과 복구를 확인한다. 기존 브라우저 Bearer 토큰은 새 웹에서 제거되므로 사용자는 재로그인이 필요하다.

격리 배포 소스는 `FLOWNOTE_RELEASE_SOURCE_ROOT`를 사용하며 Railway 조회 컨텍스트와 환경 설정은 관리 저장소가 소유한다. 동일 소스임을 확인한 기존 배포를 이어 검증할 때만 `FLOWNOTE_RELEASE_RESUME_DEPLOYMENTS`에 `staging/flownote-main` 같은 키와 정확한 deployment ID를 지정한다. 웹 키 `staging/web`은 immutable Vercel URL이며 Ready 상태·프로젝트 이름·현재 환경 별칭의 ID 일치도 확인한다. 다른 소스의 ID를 재사용하면 안 된다. 재개해도 전체 staging E2E와 동일 소스 검증을 생략하지 않는다.

## 테스트

`flownote/yarn e2e`는 공개 staging만 사용하며 로컬 webServer를 띄우지 않는다. CLI에서는 Playwright 공식 컨테이너를 브라우저 실행 도구로 사용할 수 있다. 이것은 앱 서버를 실행하는 Compose가 아니다. 테스트 계정은 staging에만 생성하며, 테스트가 만든 캔버스는 종료 시 삭제한다. 테스트 계정 행은 전용 staging 데이터로 남는다. 인증값이 포함될 수 있어 trace는 수집하지 않는다.

이전 `flownote/e2e` mock 기반 회귀 시나리오는 이력/이전 테스트 참고용이며 현재 cloud gate가 아니다. 실제 게이트는 `flownote/e2e-cloud`다.

## 설정과 기능

- `.env.example`은 공개 staging 기본값만 포함한다. 비밀값은 Railway/Vercel 변수에서 관리한다.
- 웹·모바일은 LAN/loopback URL을 다른 주소로 치환하지 않고 거부한다. EAS development/preview는 staging, production은 production API를 사용한다.
- Expo Go는 Railway `flownote-expo-go`의 HTTPS manifest/bundle을 사용한다. PC의 Metro 주소나 LAN QR를 사용하지 않는다. 이 서비스는 `all`에서 제외하고 Serverless를 켜며, 필요할 때 `node scripts/deploy-cloud.mjs staging expo`처럼 환경과 단일 대상을 명시해 배포한다. 사용 후에는 다시 중지한다.
- Expo Go staging은 `flownote-expo-go-staging` 서비스와 `https://flownote-expo-go-staging-staging.up.railway.app`을 사용한다. 기본 worker는 1개이고 Node old-space는 최초 번들 생성에 필요한 384MiB로 제한한다.
- staging의 모든 앱 서비스에는 Serverless를 기본 적용한다. production에서 중지된 `flownote-ai`, 모바일 정적 웹, Expo Go는 staging에서도 중지한다. PostgreSQL과 Redis는 데이터 계층이므로 계속 가동한다. production에서 가동 중인 앱 서비스는 콜드 스타트를 피하기 위해 always-on으로 운영한다. `flownote-sub`의 소스 디렉터리와 Go 모듈명은 `flownote-serve`로 유지한다.
- Vercel Git 직접 자동 배포는 `git.deploymentEnabled: false`로 차단한다. [공식 설정 기준](https://vercel.com/docs/project-configuration/git-configuration)을 따르며 release 스크립트의 CLI 배포만 사용한다.
- 로컬 Ollama 전용 agent-note는 제거됐다. AI 서비스가 중지돼도 게이트웨이가 capability의 disabled/removed 상태와 기존 기능 경로의 410을 직접 반환한다. Gemini agent 소스는 명시적인 AI 단일 배포를 위해 유지한다.
- 폐기한 로컬 컨테이너와 Docker 네트워크는 제거했지만 기존 DB·업로드·모델 볼륨은 삭제하지 않는다.

## iOS/iPadOS EAS 배포

`flownote-mobile`의 store 프로필은 `production`(운영 API)과 `testflight`(staging API)다. iPhone/iPad 공용 Expo 앱을 Xcode 26.0 macOS 클라우드에서 빌드한다. 1.2.0의 로컬 iOS 모듈은 `UIPencilInteraction`을 포함하므로 웹 배포만으로 Pencil 기능이 활성화되지 않는다. 최초 Apple 로그인·2FA·서명 인증서·App Store Connect 제출 권한 설정은 사용자가 EAS 터미널에서 직접 완료한다. `eas build --platform ios --profile production --auto-submit`은 TestFlight 제출을 요청하며 공개 App Store 출시가 아니다. [상세 절차](product-specs/ios-ipados-testflight.md)를 따른다. build FINISHED, submission FINISHED, Apple 처리/테스트 그룹 상태를 별개로 확인한다. EAS 패키징 설정만 바뀌고 서버 런타임이 같으면 Railway 모바일 웹/Expo Go를 깨우거나 backend를 재배포하지 않는다.

## 운영 확인과 롤백

Gateway `/`는 200/UP, `/api/users/me` 비인증 요청은 401이어야 한다. `/api/mobile/config`의 API와 웹 주소는 선택한 환경과 일치해야 한다. 웹 `/`, 모바일 `/health`를 확인한다. 운영 DB에는 스모크 테스트 데이터를 쓰지 않는다.

오류는 Railway deployment/build/runtime 로그 및 gateway request ID로 조사한다. 이전 Vercel Ready 배포와 Railway 성공 배포를 함께 복구하며 DB migration을 임의로 되돌리지 않는다. 상세 결과와 실제 배포 ID는 `logs/report/`에 기록한다.
