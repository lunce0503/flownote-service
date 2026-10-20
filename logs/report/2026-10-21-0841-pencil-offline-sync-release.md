# Apple Pencil·오프라인 재동기화 1.2.0 릴리스

기록 시작: 2026-10-21 08:41 Asia/Seoul. 상태: 최종 staging 검증과 iOS 빌드·제출 진행 중. 이 문서의 완료 표시와 최종 ID를 확인해야 한다.

## 소스와 보존

- 기존 운영 기준 snapshot `cbf2fa68e5f73bf8814e89a19c966163f2b240b6`과 공유 작업 트리를 alternate index로 비교했다. 기존 배포 변경은 일치했고 원래 HEAD/index와 사용자 변경을 되돌리지 않았다. 루트의 무관한 `app.json`은 릴리스에 넣지 않았다.
- 구현·Windows/Android 태그 source `d8aa7edf13c9a226ea9a80697245cad9991e9d30`. 최종 검증 source `8f15fdf`, branch `release/apple-pencil-offline-sync-1.2.0`, snapshot `/dev/shm/flownote-pencil-offline-final-20261021`.
- 소유 사양: [오프라인 작업 공간](../../docs/product-specs/device-only-workspace.md), [iOS/iPadOS](../../docs/product-specs/ios-ipados-testflight.md), [요청 계획](../../docs/design-docs/canvas/apple-pencil-offline-sync-plan.md).

## 구현

- `UIPencilInteraction` → local Expo iOS module → 고정 origin WKWebView의 고정 DOM 이벤트 → 지우개/직전 도구 전환. 리스너 종료 시 native interaction 해제, payload allowlist와 중복 callback 방지 적용.
- OFF 전에 노트/폴더·캔버스/폴더/이미지·작업·시간표·일기와 기준 revision을 계정별 IndexedDB에 스냅샷. 자산/저장소 실패 시 전환 중단. 기존 v1/`device-` 자료와 별도 편집 초안은 보존.
- ON은 로그인 계정을 대조하고 최신 서버본과 기준본으로 3-way 조정. 비중복 변경 결합, 구조적 변경량 우선·동률 최신 시각·완전 동률 기기본 선택. 선택되지 않은 버전/기준본/양쪽 점수를 최근 200개 복구 기록과 JSON 백업으로 보관.
- 안정된 UUID와 참조 remap, 멱등 생성, 연산 cursor 저장. 실패 재시도는 최신 서버로 다시 조정하고 ID 매핑을 재사용. 동기화 중 로컬 쓰기를 잠시 차단하며 일반 API/실시간 네트워크 차단을 유지. 캔버스 업로드는 gateway 저장 알림 경로 사용.
- 작업/일정 object storage 경로를 쓰기마다 분리하여 DB에서 거부한 생성 재시도가 기존 객체를 먼저 덮지 않도록 보완.

## 정적·단위 검증

- 웹 `yarn verify` 통과; source 단위 54/54. 기존 PDF.js eval 및 큰 chunk 경고 유지.
- FastAPI `uv run pytest`: 28/28; Spring `./gradlew test`: 통과.
- 두 Go 서비스 Docker Go 1.23 `go test ./...`: 통과. 로컬 Go가 없어 container 사용. 앱 서버/Compose/DB는 로컬 실행하지 않음.
- Expo lint/typecheck/12개 테스트/web export 통과. 모듈 검사는 실제 `expo-modules-autolinking resolve --platform apple`의 Pod graph까지 검사하도록 보강.
- Windows `npm run check`: 11/11. Android 단위/lint 및 signed release/debug assemble 통과. 최초 Android 명령은 SDK 환경 변수 미설정으로 실패했고 기존 SDK 경로를 명시해 통과.
- npm audit: desktop production 분류 0; mobile production 분류는 기존 Expo SDK 54/toolchain 전이 의존성 포함 45(critical 1/high 29/moderate 14/low 1). 자동 fix 제안이 SDK major downgrade/대규모 이전을 포함하므로 적용하지 않음. iOS release에서 Metro 개발 서버를 실행하지 않지만 audit 전체 해소로 간주하지 않음.

## Windows·Android

- Windows 1.2.0: [공개 release](https://github.com/lunce0503/flownote-service/releases/tag/windows-v1.2.0), tag runner `39469199218` 성공. Windows 실제 NSIS 설치형/portable 실행, staging 로그인·저장·프로세스 재시작 보존 검사 통과.
- exact published binary updater runner `39516123432` 성공: 기존 설치 경로 업그레이드, 서명 feed·실제 다운로드·해시·재시작 캐시·동일 버전 skip 통과. Windows Authenticode 게시자 서명은 없음.
- Android 1.2.0/versionCode 12000: [공개 release](https://github.com/lunce0503/flownote-service/releases/tag/android-v1.2.0). APK v2 서명 검증 성공. 기존 운영 인증서 SHA-256 `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`와 일치.
- Android API35 ATD에서 11000→12000 실제 OS installer 업데이트 성공: signed staging feed, 자동 다운로드·APK hash·현재 signer 검증·재시작 캐시·native 이력·사용자 설치 확인·로그인/로컬 probe 유지·동일 버전 skip 통과. ATD에 Settings 앱이 없어 설치 허용 스위치는 현장 검증 대상으로 남기고 테스트 app-op 사용. 검증 후 해당 에뮬레이터 중지.

| 파일 | bytes | SHA-256 |
| --- | ---: | --- |
| Flownote-Setup-1.2.0-x64.exe | 111835165 | `ac4035a8508f881390a447f73bfcc6c6affe484b199281607274d868f1b34e2b` |
| Flownote-Portable-1.2.0-x64.zip | 153458642 | `6714a652cfbb3a08766e2eb816c35738bb76e0193b304319ca99e5074b030ee2` |
| flownote-1.2.0.apk | 55068 | `62a689676b4f45b220213adf2bc713cdbad36e6265a8ab2f36fb900aadb93ccd` |
| flownote-1.2.0-staging.apk | 62462 | `d3441f66dbbaa5d5093a25aed24fdcddab335b66f861ab7791c1a1acde212cb9` |

## iOS/iPadOS

- 1.2.0(5) EAS `89e580e1-c812-41ae-8a0b-b0ca4299ad0b` FINISHED였으나 실제 autolink 확인에서 Pencil podspec 누락 발견. 이 빌드를 Pencil 완료 기준으로 사용하지 않는다.
- 1.2.0(6) EAS `c347cd9a-cdcd-4bce-a8a1-1a67dd00edc7`: Pod 포함 후 native compile에서 Expo Module이 `NSObjectProtocol` delegate를 직접 구현할 수 없어 실패. NSObject 기반 delegate helper로 분리.
- 최종 1.2.0(7) EAS `2678f3ab-07db-4d68-9dc9-77382219170e`, submission `fce3e43e-27ba-4b1e-b2ac-136e0efbb147`: 상태 확인 중. 실제 Xcode log에서 `ApplePencilEvents` 컴파일·정적 라이브러리 패키징 확인.
- EAS는 공유 worktree의 원래 HEAD를 metadata로 기록했으므로 gitCommitHash만으로 archive를 판단하지 않음. 업로드 source는 릴리스 branch에 보존했으며 모듈 autolink/Xcode log/최종 IPA로 확인한다.
- 기존 EAS 원격 제출 키를 메모리에서만 사용해 Apple API의 build processingState와 기존 `Team (Expo)` 내부 그룹을 조회. 키/토큰/원본 log URL은 기록하지 않음.
- Pencil 실제 본체 double-tap, 압력·손바닥 거부, WKWebView OS 종료/공유 시트는 물리 iPad 미연결로 미검증. WebKit 이벤트 에뮬레이션은 하드웨어 검증이 아님.

## Cloud staging-first

- staging main `5e8ab49a-250d-4de8-8db2-579e4cc39e37`, canvas `4daf7c9d-a441-4ba9-93fb-63b5366be1b5`, api `93e7d3bd-2bb7-4901-ac8c-94616a207bf4`: SUCCESS. 최종 source와 해당 하위 프로젝트가 같아 정확한 ID로 재개.
- serve 초기 `a35400e2-8a01-48ca-8c34-4906de418035` 이후 객체 쓰기 보완 source를 `4240b682-5941-461b-948c-01317dfbc216`에 배포. 최종 source의 동일 backend 배포를 재사용.
- 1차 web `https://flownote-react-staging-qzj4jujc5-flownote-service.vercel.app`에서 앱 탐색·서명 feed·APK/Windows 다운로드 검사 통과 후 리뷰 보완 source로 교체하기 위해 초기 E2E 중단. 통과 receipt/production 승격 근거로 사용하지 않음.
- 중간 staging 오케스트레이터는 최종 내부 표식 제거 패치 반영을 위해 종료했다. 완료된 backend deployment를 중복 생성하지 않고 동일 소스 ID를 재개한다.
- 최종 source의 전체 staging E2E, production ID 및 read-back 결과: 진행 중.

## 남은 완료 기준

최종 staging 전체 gate 통과 → 같은 source production 배포/health·서명 feed read-back. iOS 최종 EAS FINISHED·submission FINISHED·Apple VALID 및 기존 내부 그룹 포함 확인. 이 항목을 실제 확인한 뒤 문서의 진행 중 표시를 완료로 갱신한다.
