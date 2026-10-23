# 공통 CI Node 수정과 Windows EXE 배포

## 결과

- 사용자 요청: 기존 Node engine 오류를 수정해 공통 CI를 통과시키고 Windows 릴리스는 항상 EXE로 배포한다.
- Node 수정 커밋: `flownote-service`의 `8c5af79bbc498a5bf0fff1c04461aa8d3ec9df3e`.
- 최종 서비스 소스: `224d7fbd2385ff604207ef2068efd502ffae1086` (`main`).
- 최종 공통 CI: https://github.com/lunce0503/flownote-service/actions/runs/39939237994 — 8개 job 모두 SUCCESS.
- 원격 앱 CI: https://github.com/lunce0503/flownote-service/actions/runs/39939237992 — Windows/Android 모두 SUCCESS.
- 공개 시험판: https://github.com/lunce0503/flownote-remote-service/releases/tag/v0.1.1 — release ID `421714508`, draft=false/prerelease=true.
- 릴리스 소스: `f5341a9a669d0accbebe5bee85d697c174b074d6`, 태그 `v0.1.1`. 게시 시각 2026-10-23 19:31:45 Asia/Seoul.
- 릴리스 CI: https://github.com/lunce0503/flownote-remote-service/actions/runs/39939235773 — Windows/Android/release 전부 SUCCESS.

## Node 오류 수정

`.github/workflows/mobile-was.yml`의 mobile job을 Node 20.19.0에서 20.19.4로 변경했다. `@react-native/dev-middleware@0.81.5`가 요구하는 >=20.19.4에 맞춘 최소 수정이다. 기존 모바일 소스·lockfile·다른 로컬 작업은 포함하지 않았다. 원인·수정은 `logs/bugs/2026-10-23-mobile-ci-node-engine.md`에 기록했다.

첫 수정 run https://github.com/lunce0503/flownote-service/actions/runs/39938735609 에서 mobile의 의존성 설치와 `yarn verify`, 공통 CI 전체가 성공했다. 이후 EXE 배포 코드를 포함한 최종 소스에서도 web/mobile/Spring/FastAPI 2개/Go 2개/cloud-config 총 8개 job이 모두 성공해 기존 실패가 해결됐음을 확인했다.

## EXE 배포 정책과 구현

Windows 공개 파일은 앞으로 항상 `Flownote-Remote-<version>-windows-x64.exe`다. 기존 .NET self-contained/single-file publish를 유지하고 버전이 붙은 EXE 자체를 배포한다. ZIP 압축 해제·별도 .NET 설치·옆의 DLL/라이선스 파일이 필요하지 않다.

Sound Manager/.NET 라이선스와 서드파티 고지를 WPF assembly resource로 포함하고 앱의 **오픈소스 라이선스** 창에서 원문을 읽을 수 있게 했다. CI는 배포할 EXE만 있는 빈 폴더에서 실제 실행·내장 라이선스 표시·설정 저장·재시작 복원을 검사한다. artifact와 release 업로드·checksum 생성이 EXE 파일명을 명시하므로 ZIP만 생성되면 게시되지 않는다.

버전을 0.1.1로 맞추고 Android versionCode는 2로 올렸다. Android는 기존 release 키를 그대로 사용한다. 두 저장소에 같은 원격 앱 소스를 반영했으며 50개 파일의 Git blob hash 일치를 확인했다. README·릴리스 절차·제품 사양·v0.1.1 릴리스 노트에 EXE 정책을 명시했다.

Windows Authenticode·설치 프로그램·자동 업데이트는 이번 범위에 없으며 기존과 동일하게 제공하지 않는다. v0.1.0 ZIP은 과거 배포 이력으로 보존하고 v0.1.1부터 새 공개 Windows 파일은 EXE만 제공한다. 카메라 인식·실제 소리 출력·비서 실행은 여전히 후속 기능이다.

## 검증

- .NET 10 SDK 빌드 컨테이너의 `dotnet build src/Flownote.Remote.Windows -c Release`: 경고 0/오류 0.
- `node scripts/check-release.mjs`: Windows/Android 0.1.1 일치 확인. EXE artifact 설정과 문서 링크 검사, `git diff --check` 통과.
- Windows runner: 코어 정책 검사와 실제 EXE의 실행·내장 MIT 라이선스 표시·설정 저장/재시작 복원 PASS. 추가 배포 파일 없이 실행했다.
- Android runner: 단위/lint/release 서명 빌드와 Android 10 에뮬레이터의 동일 서명 APK 설치/실행·카메라 권한 미요청 확인 PASS.
- 공개 EXE/APK/checksum을 재다운로드해 `sha256sum -c SHA256SUMS.txt` 두 파일 OK. EXE는 PE32+ GUI x86-64 및 MZ 헤더로 확인했다.
- APK는 `com.flownote.remote.gesture`, versionName 0.1.1/versionCode 2, 기존 인증서 SHA-256 `ebf8133cbb95a8c916ea2e05ed4b798ecb3db22f5a6a6d37a328afcf139ab0ed`와 일치한다.

| 공개 파일 | 크기 (bytes) | SHA-256 |
| --- | --- | --- |
| `Flownote-Remote-0.1.1-windows-x64.exe` | 139822205 | `98987980eb661ed0a83c3d3995f219f806b5c45108192319224bbe4aea0de924` |
| `Flownote-Remote-0.1.1-android.apk` | 25742 | `161afdcc01f7f5d33da67241695089198da698c11d9d9bb190602f8abb8cccb8` |
| `SHA256SUMS.txt` | 204 | `17cafc6967e86e8cf3eb077b3bd287f51c8541891247d21e2b735fb63389641f` |

## 보존과 배포 범위

미커밋 작업이 많은 원래 작업 공간을 보호하기 위해 격리된 Git worktree에서 관련 파일만 커밋·push했다. 허용된 Node workflow 변경을 제외한 기존 tracked diff SHA-256은 작업 전후 `5f6ee5a9023764cb60bf36b06f08f207a750543903547a31963f0ff1f4268295`로 동일하고 원래 인덱스는 빈 상태로 유지됐다. 서명키·비밀번호는 Git에 넣지 않았다.

최종 보고서만 추가하는 후속 커밋은 `[skip ci]`로 중복 빌드를 생략하고 위 검증된 소스/run ID를 보존한다. 앱·CI 동작은 바꾸지 않는다.

이번 배포 대상은 GitHub 네이티브 앱이며 웹·Railway 런타임·다운로드 페이지는 변경하지 않았다. Vercel/Railway staging/production 배포는 적용하지 않았고 로컬 앱 서버·Compose도 실행하지 않았다. 보고서 전용 후속 변경은 규칙에 따라 Docker/배포를 생략한다. 향후 웹 다운로드 자산을 반영할 때는 서비스 저장소에서 `node scripts/deploy-cloud.mjs release web`으로 staging 검증 후 같은 소스를 production에 배포한다.
