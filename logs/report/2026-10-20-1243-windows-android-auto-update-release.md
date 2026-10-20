# Windows 1.1.1·Android 1.1.0 자동 업데이트 릴리스

작성 기준: 2026-10-20 12:43 KST, 최종 갱신 13:12 KST. 이 보고서의 대상은 `flownote-desktop` Windows와 `flownote-android` Android다. 후속 iOS/EAS 작업은 [별도 보고서](2026-10-20-1312-ios-ipados-testflight-preparation.md)에 기록한다.

## 구현

- 최종 목표: Windows 1.1.1, Android 1.1.0/versionCode 11000. Windows 초기 1.1.0은 실제 networking 검사에서 redirect 취소 오류를 발견해 덮어쓰지 않고 수정 버전을 새로 배포한다. Android는 기존 패키지/운영 서명 인증서를 유지한다.
- 기존 배포 웹의 베이지·흰색·검정 디자인, Canvas/Notes 폴더 탐색과 동일 계정 cloud API를 사용한다. 새 로컬 앱 서버/DB/fallback은 추가하지 않았다.
- 시작·재개·주기 확인, 새 버전 자동 다운로드, 변경 내용/최근 확인·다운로드 이력/진행/실패·재시도, 같은 버전 skip, 최고 관측 버전보다 낮은 feed 차단을 구현했다. 자동 확인 최소 간격 15분, 실행 중 주기 1시간이다.
- Windows는 도움말 메뉴·작업 표시줄 진행률·준비 알림을 제공한다. NSIS marker로 설치형/portable을 구분한다. 설치형은 저장 확인 후 설치기를 실행하고 portable은 ZIP 위치를 열어 직접 압축 해제한다. 실행 중 portable 자동 교체는 보장하지 않는다.
- Android는 하단 native 상태/버튼으로 확인·설치를 제공한다. 앱 전용 저장소에 APK를 받고 검증 후 OS installer에 read-only content URI를 전달한다. ‘이 출처 허용’과 설치 승인은 사용자가 수행한다. 무인 설치는 하지 않는다.
- 기존 1.0.0에는 updater가 없으므로 Windows 1.1.1/Android 1.1.0을 한 번 직접 설치해야 한다. Windows 초기 1.1.0도 직접 1.1.1로 업데이트해야 한다. 앱을 삭제하지 않고 업데이트한다. WebView/Electron userData·로그인·초안을 지우지 않는다. 만료/폐기된 세션의 재로그인은 별개다.

## 업데이트 신뢰 경계

- feed: 각 고정 cloud origin의 `/updates/<staging|production>/<windows|android>.json`.
- envelope: `{payload: base64(JSON UTF-8), signature: base64(RSA SHA-256)}`. 앱 고정 공개키 검증 후 schema·채널·플랫폼·정식 버전·정확한 URL·크기·SHA-256을 확인한다.
- RSA 공개키 SPKI SHA-256: `746b383e283b6716cf9f2cd819bf48928b7ca327e30fcca1e35c929f220eab09`.
- Windows는 고정 GitHub repository/tag/파일명과 HTTPS GitHub release CDN redirect만 허용한다. `.part` 다운로드 완료/해시 검증 후 rename하고 캐시를 재검증한다. 설치 실행 직전에도 검사한다.
- Android는 환경별 고정 APK 경로와 redirect 없는 HTTPS를 사용한다. 현재 설치와 APK package/versionName/증가 versionCode/인증서까지 대조하고 설치 직전 재검증한다. debug/production 패키지·APK·feed·데이터를 분리한다.
- renderer에 Node/preload/IPC/native JS bridge를 추가하지 않았다. 다운로드에 사용자 인증 쿠키/토큰을 전달하지 않는다. 개인키는 저장소 밖 운영자 전용 저장소에 권한 600으로 보관한다. 보고서/artifact에 포함하지 않는다.
- Windows Authenticode 게시자 서명은 없다. feed의 RSA 서명과 Authenticode는 별개다. 최초 수동 설치는 GitHub HTTPS 출처와 SHA256SUMS를 확인한다.

## 최종 배포 파일

| 파일 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| Flownote-Setup-1.1.1-x64.exe | 111835009 | `2a662b03b85cb08cf7f97114a401e434f6274eaae613c80137e19cb50ec18399` |
| Flownote-Portable-1.1.1-x64.zip | 153458639 | `3e1ae6b16cc58d8c258772ebe86a204bc745e2c807857c17aa16f1fb5b48fbb1` |
| flownote-1.1.0.apk | 55068 | `546c72d28e658bdc22a5644e46b7d51af0352b49f1f1412dc1cb48db72ab5a69` |
| flownote-1.1.0-staging.apk | 62458 | `b0b30c272ff91d8ee46b3c0aeb246881a6e28200f5a1b23ac54eeb59129821fa` |

Android 운영 인증서 SHA-256: `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad` (1.0.0과 동일), RSA 3072-bit / APK v2 서명 검증 성공.

- Windows release: https://github.com/lunce0503/flownote-service/releases/tag/windows-v1.1.1
- Windows EXE: https://github.com/lunce0503/flownote-service/releases/download/windows-v1.1.1/Flownote-Setup-1.1.1-x64.exe
- Windows ZIP: https://github.com/lunce0503/flownote-service/releases/download/windows-v1.1.1/Flownote-Portable-1.1.1-x64.zip
- Android 공개 release: https://github.com/lunce0503/flownote-service/releases/tag/android-v1.1.0 (draft 해제 완료).
- Android 운영 APK: https://flownote-react.vercel.app/downloads/flownote-1.1.0.apk.
- 운영 설치 안내: https://flownote-react.vercel.app/windows.html / https://flownote-react.vercel.app/android.html

## 정적·빌드·OS 검증

- 실패 테스트 선행 후 `node scripts/test-app-updates.mjs`: Node 7개 및 순수 JVM 정책 테스트 통과. 서명 변조, 잘못된 채널/플랫폼/URL, HTTP/외부 redirect, 정상 GitHub CDN redirect, oversize, 버전 비교, downgrade, single-flight, 재시작 캐시, 변조 캐시 재다운로드, 실패 후 재시도를 포함한다. 양 앱 공개키 일치도 검사한다.
- `cd flownote-desktop && npm run check`: 11개 통과. origin 고정, 외부 protocol 제한, 파일명 정리 회귀를 포함한다.
- `npm audit --omit=dev --json`: npm의 production 의존성 분류상 취약점 0. Electron 자체는 devDependency로 선언돼도 앱 runtime에 포함되므로 이 검사만으로 Electron 보안 전반을 보증하지 않는다. 전체 audit는 기존 electron-builder의 개발 도구 전이 의존성 sprintf-js 관련 moderate 8개를 보고했다. 자동 downgrade/무관한 대규모 의존성 변경은 하지 않았다.
- Android `./gradlew assembleDebug assembleRelease lintRelease`: 성공, lint 오류/경고 0. test version override는 debug에서만 허용한다. `apksigner verify --verbose --print-certs`: 통과.
- `cd flownote && yarn build`: 성공. 기존 PDF.js eval/번들 크기 경고는 유지한다.
- Windows 사전 runner `39363975994`: 패키징 성공, staging 계정 fixture POST의 HTTP 502로 실패. read-only 준비 확인을 추가했다. 수정 후 runner `39364360979`: 실제 NSIS/portable 설치 실행·sandbox·로그인/초안 process restart 보존·cloud canvas 저장·native 파일 저장 통과.
- 실제 공개 Windows tag runner `39365014077`: Windows job 및 release job 성공. 동일 job에서 검증한 EXE/ZIP을 공개했다. tag source `905333eabac1ac95190cbf4e952364e881dda5c3`.
- 이 초기 1.1.0에는 실제 `net.fetch` redirect 취소 오류가 있으므로 사용 권장은 철회하고 릴리스 설명에 1.1.1 수동 설치를 안내했다. 삭제/덮어쓰기하지 않았다. 수정 tag source `f553e15aad35daff3c612c04322a1fc67cea3f95`, runner `39366482488`은 Windows 실제 설치/portable 및 공개 release job 모두 성공했다. GitHub asset upload digest와 공개 SHA256SUMS도 위 표와 일치했다.
- Windows staging 화면을 검토해 앱 헤더 부재, 왼쪽 탐색, 아이보리/검정 외관을 확인했다.
- 추가 runner `39365465978`은 portable test fixture의 redirect/context 경합으로 실패했고 검사 코드를 보완했다. `39365683978`은 검사 환경의 lexical require 부재로 실패해 Node builtin createRequire로 수정했다. `39366187676`은 실제 `Redirect was cancelled`를 발견했다. 수정 버전의 exact published binary update-only 검사를 추가한다.
- 최종 runner `39367573008` 성공: 공개 1.0.0 설치기에서 1.1.1로 같은 폴더에 실제 업그레이드하며 staging profile probe 보존을 확인했다. 공개 1.1.1 설치형/portable의 packaged main process에서 실제 Node fetch로 EXE/ZIP 다운로드, 서명·해시·재시작 캐시·동일 버전 skip을 모두 통과했다. 직전 `39367145046`의 실패는 PowerShell HTTP Content를 문자열로 간주한 과거 checksum fixture 오류였으며 파일 다운로드 후 UTF-8 Get-Content로 보완했다. 공개 앱 파일은 변경하지 않았다.
- Android API 35 Google ATD에서 1.0.1-staging/versionCode 10001→1.1.0/versionCode 11000 실제 OS upgrade를 완료했다. 서명된 최종 staging feed·자동 다운로드·APK hash/현재 signer 검증·재시작 캐시·native 이력·권한 안내·OS의 명시적 UPDATE 확인·설치 완료 OPEN 이후 로그인/초안 보존·동일 버전 skip을 검증했다. `/tmp/flownote-android-post-install.log`에 최종 PASS 기록이 있다. 테스트 fixture는 OS 설치 완료 activity 종료 후 새 WebView가 준비될 때까지 기다리도록 보완했다.
- ATD에는 Settings 앱이 없어 설치 허용 스위치 UI는 검증하지 못한다. native 안내를 확인하고 테스트 전용 app-op으로 권한을 부여한 뒤 installer를 시험한다. 실사용 휴대폰·태블릿/제조사별 설정·보안 확인은 별도 현장 검증 대상이다. ATD 화면 캡처는 검정이므로 native 시각 검증 통과로 간주하지 않는다.

## Cloud staging / production

- 최초 staging 웹 `dpl_AiWAbWYRkzEx2Mss72d5oFgm2GU8`: 52/52 통과, fingerprint `2966aae28284ab512c99a5f2103c8786e5389cbc2ee920c51e071446708b431c`. APK 설정 예외 수정 및 최종 Windows feed 반영 전이므로 운영 승격에는 사용하지 않는다.
- 55개 gate 최초 실행은 기존 canvas pointer 시나리오 2개가 line count 0으로 실패했고 나머지 53개 통과했다. 같은 immutable deployment에서 두 시나리오를 각 3회 반복해 6/6 통과했으며 원인은 확정하지 않았다. 테스트를 약화하거나 canvas 제품 코드를 바꾸지 않았다. 전체 gate 재확인을 수행한다.
- 최종 source snapshot은 `/dev/shm/flownote-apps-release-20261020`이며 현재 작업 트리의 배포된 미커밋 웹 소스를 포함한다. 사용자 worktree/index/HEAD는 되돌리지 않았다. Windows 1.1.1 최종 feed 이후에는 새 fingerprint로 staging부터 검증한다.
- 운영 승격은 최종 staging과 native 시험이 통과한 동일 snapshot으로 `FLOWNOTE_RELEASE_SOURCE_ROOT=<snapshot> node scripts/deploy-cloud.mjs production web`을 실행한다. 통합 명령은 `node scripts/deploy-cloud.mjs release web`이다.
- API/DB 변경을 이번 앱 작업에서 추가하지 않았으므로 backend/Railway 바이너리 재배포는 생략한다. 배포 스크립트의 환경별 URL/기존 serverless 정책 적용은 유지한다. Docker는 cloud 테스트 브라우저와 Android 에뮬레이터 도구로만 사용했다. 앱 서버/DB/Compose를 로컬 실행하지 않았다.
- 최종 staging: `dpl_4Yp5SUunBX3piYr6A3BpKVphMVW4`, `2026-10-20T04:02:49.594Z`, 전체 55/55 통과. fingerprint `31e6962c0878fb7be99e2c88d5f0ad295f186d6989052002e1d75b4f2e1c1f65`.
- 동일 snapshot production: `dpl_GLbLYqB2RkidddECJU8SunSvpDbQ`, `2026-10-20T04:06:11.686Z`, READY. immutable URL `https://flownote-react-o09cieiqe-flownote-service.vercel.app`. 운영 alias와 fingerprint가 일치한다.
- production read-back: Windows 1.1.1/Android 1.1.0 signed feed RSA·채널·플랫폼·no-store·각 asset 크기/접근, Android APK SHA-256, 두 설치 안내의 버전, 공개 GitHub Android APK hash 모두 통과. 운영 CRUD 시험은 하지 않았다.

## 마지막 상태

Windows 1.1.1 및 Android 1.1.0 공개 릴리스와 production 업데이트 feed/안내 배포 완료. 기존 1.0.0 및 Windows 초기 1.1.0 사용자는 최신 버전을 한 번 수동 설치해야 한다. Android 실제 제조사별 설치 설정 화면과 Windows Authenticode 서명은 위 제한대로 남는다. Android 테스트 에뮬레이터는 검증 후 중지했다. iOS TestFlight는 별도 Apple 최초 인증이 필요하며 이 완료 상태에 포함하지 않는다.

릴리스 소스/검증 문서는 원래 사용자 HEAD/index를 변경하지 않고 `codex/apps-1.1.0` 브랜치에 별도 snapshot commit으로 보존한다. Windows 공개 tag는 실제 빌드 source를 고정한다. main에 병합하거나 무관한 backend 자동 배포를 트리거하지 않았다. 보고서 최종 갱신만을 위한 추가 Docker 빌드/클라우드 배포는 생략한다.
