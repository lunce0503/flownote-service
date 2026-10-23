# 원격 앱의 flownote-service 편입

- 요청: 원격 앱 소스를 `lunce0503/flownote-service`에도 포함한다.
- 반영 위치: https://github.com/lunce0503/flownote-service/tree/main/flownote-remote
- 소스 커밋: `a4b143001c6e844c7170dc0bf671ed78f5726471` (`main`).
- 원격 앱 CI: https://github.com/lunce0503/flownote-service/actions/runs/39923552636 — Windows/Android 모두 SUCCESS.

## 변경 범위

독립 저장소 `lunce0503/flownote-remote-service`의 `bb60e21`과 동일한 49개 소스 파일을 `flownote-remote/`에 포함했다. 설정·코어·WPF/Android 앱·재사용 MIT 소리 코어·라이선스·릴리스 스크립트와 문서를 포함한다. 파일별 Git blob hash로 동일성을 확인했다.

서비스 저장소 루트에는 `.github/workflows/gesture-remote-apps.yml`, 제품 사양·색인, ARCHITECTURE의 원격 앱 행, 이 작업의 기존 버그/초기 설정/이름 정정/릴리스 보고서만 추가했다. 소스 편입 커밋은 총 57개 파일이다. 그 외 진행 중이던 웹·모바일·인증·백엔드 변경은 포함하지 않았다.

기존 작업 공간에 미커밋 작업이 많아 최신 origin/main을 기준으로 격리된 Git worktree에서 커밋·push했다. 원래 작업 공간의 tracked diff SHA-256은 작업 전후 `5f6ee5a9023764cb60bf36b06f08f207a750543903547a31963f0ff1f4268295`, staged diff는 빈 상태로 동일하다. 원래 작업 공간의 로컬 main/인덱스를 강제로 이동하거나 파일을 덮어쓰지 않았다.

APK/Windows ZIP 및 v0.1.0 시험 릴리스는 기존 독립 저장소에서 제공한다. 이번 요청은 서비스 저장소에 소스를 추가하는 작업이며 릴리스 이동·삭제·중복 게시를 하지 않았다. 독립 배포 workflow는 앱 하위 폴더에 함께 보관되며, 서비스 저장소에서는 루트의 전용 CI만 실행한다. 서명키·비밀번호·캐시·빌드 결과물은 Git에 포함하지 않았다.

## 검증

- 편입 소스에서 `node scripts/check-release.mjs`: 0.1.0 버전 일치 확인.
- Android 디렉터리에서 `ANDROID_HOME=<SDK> ./gradlew testDebugUnitTest lintDebug assembleDebug`: 성공, 정책 단위 테스트·lint·debug APK 빌드.
- 공식 .NET 10 SDK 빌드 전용 컨테이너에서 `dotnet run --project tests/Flownote.Remote.Checks -c Release`: 성공.
- 루트 workflow의 Windows/Android 작업 디렉터리와 관련 문서의 상대 링크, `git diff --check`, 공개 대상 파일/비밀값 패턴 검사 통과.
- GitHub의 같은 소스 커밋 `a4b1430`에서 Windows 코어 검사·WPF release 빌드 및 Android 단위/lint/debug APK CI가 모두 성공했다.
- GitHub API로 main의 앱 디렉터리와 소스 커밋 존재를 재확인했다.

초기 로컬 버전 검사 명령을 Android 디렉터리에서 잘못된 상대 경로로 실행해 MODULE_NOT_FOUND가 발생했다. `node ../scripts/check-release.mjs`로 정정해 통과했으며 소스 오류는 아니었다.

## 기존 공통 CI 실패

공통 Quality Gates: https://github.com/lunce0503/flownote-service/actions/runs/39923552425

web, Spring, FastAPI 2개, Go 2개, cloud-config는 성공했다. `mobile`만 `flownote-mobile`의 `yarn install --frozen-lockfile --non-interactive`에서 실패했다. 현재 workflow는 Node 20.19.0을 사용하지만 `@react-native/dev-middleware@0.81.5`는 Node >=20.19.4를 요구한다. `yarn verify`에는 도달하지 못했다.

편입 전 커밋 `21d2d94`의 https://github.com/lunce0503/flownote-service/actions/runs/39089912302 에서도 mobile의 같은 설치 단계가 실패했다. 이번 소스 커밋은 `flownote-mobile/`와 `.github/workflows/mobile-was.yml`을 변경하지 않았음을 diff로 확인했다. 원격 앱 추가와 독립적인 기존 CI 설정 문제로 기록하며 이 요청에서 수정하지 않았다.

다음 조치: 기존 모바일 workflow의 Node를 의존성이 허용하는 >=20.19.4 버전으로 맞춘 뒤 설치·`yarn verify`와 Quality Gates를 재검증한다. 관련 없는 모바일 로컬 작업을 함께 push하지 않는다.

## 기록과 배포

이 최종 보고서는 검증한 앱/CI 소스를 바꾸지 않는 보고서 전용 후속 커밋으로 기록한다. 중복 빌드 방지를 위해 보고서 커밋만 `[skip ci]`를 사용하며 소스 커밋의 검증 결과는 위 run ID에 고정한다.

웹·Railway 런타임·다운로드 페이지를 변경하지 않아 Vercel/Railway staging/production 배포는 진행하지 않았다. 보고서 전용 후속 변경도 저장소 규칙에 따라 Docker/배포를 생략한다. 추후 웹 다운로드 자산을 반영할 때의 명령은 서비스 저장소 루트에서 `node scripts/deploy-cloud.mjs release web`이며 staging 통과 후 production으로 승격한다.
