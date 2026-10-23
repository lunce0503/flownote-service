# 전공서 책장 앱 릴리스

작성: 2026-10-24 07:45 Asia/Seoul. 상태: 네이티브 릴리스 완료, 최종 웹 staging gate 진행 중. 완료 시각·운영 배포 결과는 아래에 갱신한다.

## 요청과 소스 보존

기존 application manage 세션 `01a04858-b6df-7613-91da-c92a37955657`이 [앱 배포 인계](../../docs/operations/app-release-handoff.md)를 받아 Android·iOS/iPadOS·Windows를 구현·검증·릴리스했다. 기존 Pencil·오프라인 조정 기능을 유지하며 [전공서 책장](../../docs/product-specs/textbook-library.md)의 네이티브 저장/내보내기를 보완했다. 책장 서버 동기화는 추가하지 않았다.

- 웹 배포 기준: `/tmp/flownote-library-release-20261024`, fingerprint `22ca4a3e3196cc7f7b61e495a5e0cd9061f028ece90cf1a9051b6abfb1ba9728`. [기존 웹 보고서](2026-10-24-0033-textbook-library-web.md).
- 기준 스냅샷과 공유 작업 트리를 대조했다. 시작 시 Flownote 웹의 기존 파일 차이는 `downloadBlob.ts` 보완이었고 네 앱의 기존 변경을 보존했다. 별도 `flownote-remote/` 소스는 이번 앱 작업에 편입하지 않았다.
- 공유 HEAD/index를 변경하거나 reset하지 않았다. 별도 index와 격리 worktree `/tmp/flownote-library-git-130`을 사용했다.
- 네이티브 iOS/Android 소스: `e8414cbd6f22f021f5a0321e15f44aced29ea752`. 이후 해당 실행 소스가 바뀌지 않았음을 git diff로 확인했다.
- Windows 릴리스 소스: `27c8b6ba0c52ba8c527790b509fb336becd944e7` (`windows-v1.3.1`). 웹 최종 소스: `a2f55d7222490eab47617c42eabc16ece6bae207` (`release/library-apps-1.3.0`, `android-v1.3.0`). Windows 패키징 실행 파일들도 태그와 동일하다.

## 구현

- iOS: PDF 전용 start/chunk/finish/cancel 메시지와 256KiB 확인 응답을 추가했다. 최대 100MiB를 Expo SDK54 FileHandle에 순서대로 쓰고 사용자 확인 후 공유한다. 전체 PDF base64를 한 번에 만들지 않는다. 다른 형식의 기존 8MiB 경로를 유지한다.
- 브리지 계약: 고정 HTTPS origin, UUID, 정확한 필드, PDF 확장자, 전체 크기, 순서, 실제 헤더를 검사한다. 확인 대기 중 이동·취소·오류·미완료 파일을 정리하고 공유가 끝나기 전에는 캐시 파일을 지우지 않는다. 실제 SDK54 API와 RN0.81 Hermes의 [Base64 구현](https://raw.githubusercontent.com/facebook/hermes/hermes-2025-07-07-RNv0.81.0-e0fc67142ec0763c6b6153ca2bf96df815539782/lib/VM/JSLib/Base64.cpp)을 대조했다.
- Android: JavaScript interface를 추가하지 않고 WebView의 Blob slice를 256KiB씩 읽어 private cache에 쓴 뒤 시스템 저장 선택기에 전달한다. 100MiB·헤더·순서를 검증하고 부분 캐시를 정리한다. 기존 다른 형식 32MiB 경로는 유지한다. trusted origin의 userinfo도 거부한다.
- Windows: Electron 기본 다운로드 스트림을 유지하고 100MiB 책장 등록·표지·읽기·프로세스 재시작·원본 내보내기 검증을 추가했다. Electron 44.9.0을 사용한다.
- 책장 UI는 앱의 기기 보관과 100MiB 한도를 알린다. 계정별 IndexedDB v1, 원본 ArrayBuffer, 기존 프로필·초안·동기화 조정 로직은 유지한다. 저장 공간/메모리 부족은 실패로 처리한다.

## 앱 릴리스

| 플랫폼 | 버전 | 채널·증거 |
| --- | --- | --- |
| Android | 1.3.0 / 13000 | [GitHub APK](https://github.com/lunce0503/flownote-service/releases/tag/android-v1.3.0), APK와 SHA256SUMS.txt 게시 |
| Windows | 1.3.1 | [설치형·포터블](https://github.com/lunce0503/flownote-service/releases/tag/windows-v1.3.1), 정확한 공개 파일의 updater 검증 완료 |
| iOS/iPadOS | 1.3.0(8) | [EAS build](https://expo.dev/accounts/lunce02/projects/flownote-mobile/builds/41bfceb7-2933-4ab8-984c-511034baca24), FINISHED |

iOS 제출 `8666f90e-2c6b-4db0-afc8-3e82d748a2c2`는 FINISHED. Apple build `0553dd73-70ee-491f-80c6-4390bb49196c`는 VALID, `IN_BETA_TESTING`, autoNotifyEnabled=true. 기존 `Team (Expo)` 내부 그룹 `87a0ee3a-244a-4239-8437-b8e302669dd2`에 build 8이 배정됐고 테스터 1명을 확인했다. 공개 App Store 출시와 구분한다. Xcode archive에서 기존 ApplePencilEvents의 실제 설치·컴파일과 `ARCHIVE SUCCEEDED`를 확인했다.

Android 운영 APK는 66,176 bytes, SHA-256 `0516300cb76fda2f2b65060b39191aee4c7aadd05e0676e4b0b4f556a32be416`. staging APK는 75,562 bytes, SHA-256 `55fc5916d1d59e378e3881bc923272f2450df8b1f3d0b52960dec594ed1c34cd`. 운영 인증서 SHA-256 `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`로 기존 앱과 같다.

Windows installer 111,835,289 bytes, SHA-256 `750bc3b1d9e5d569beb374805e8e27149285837b1c72dc900b70a2a8924db87b`. portable 153,458,649 bytes, SHA-256 `d4f7d4ffab651047096b7e33e5165bb97a477a2f502175085da4a372caa776f1`. 양 채널 feed는 기존 앱에 고정한 RSA 공개키에 대응하는 저장소 밖 키로 서명했다.

## 검증

- `flownote/yarn verify`: 통과. `flownote-mobile/npm run verify`: lint·typecheck·16 tests·Expo export 통과. desktop `npm run check`: 11 tests 통과.
- PDF receiver 4 tests: 100MiB 정확한 해시, origin/schema/size/header/sequence 거부, 미완료·취소·지연 승인·공유 중 취소 정리. 순수 JVM PDF sink도 100MiB 해시·한도·순서·헤더·정리를 통과했다. 기존 앱 업데이트 단위 계약도 통과했다.
- 웹 sender + 실제 native receiver 코드를 연결한 100MiB 원본 PDF 브리지 E2E: Chromium 및 iPad WebKit 2/2 통과. 브리지 수신/파일 sink 주입 에뮬레이션이며 실제 iPad 공유 시트를 실행한 검증은 아니다.
- Android API35 일반 Google APIs 에뮬레이터: 실제 시스템 파일 선택 → 100MiB PDF 등록 → 표지·읽기 → 1.2.0 APK에서 1.3.0 APK로 업데이트 → 원본 출력의 크기/SHA-256 일치를 `library-smoke.mjs` 전체 실행으로 통과했다. 데이터 초기화/앱 삭제 없이 로그인과 책을 유지했다.
- Android updater: staging signed feed, 실제 APK 자동 다운로드·해시·native signer, 프로세스 재시작 후 캐시 재사용을 확인했다. 일반 이미지의 Settings가 Compose checkable view, 완료 버튼이 `Open`이어서 기존 ATD 전용 selector 가정이 실패했다. 새 native UI의 실제 권한 토글과 OS UPDATE/Open을 직접 구동해 12000→13000 설치를 완료했다. 이어 `device-update-smoke.mjs --post-install`이 로그인·초안 보존·같은 버전 재다운로드 생략을 통과했다. 앱 실패로 기록하지 않으며 자동 검사와 보완 구동을 구분한다.
- Windows [build/release run 40034122132](https://github.com/lunce0503/flownote-service/actions/runs/40034122132): 설치형·포터블 각각 sandbox·로그인·프로필/초안 복원·메뉴·캔버스 클라우드 저장·100MiB 책장/원본 출력 통과 후 게시했다.
- Windows [공개 파일 updater run 40034919266](https://github.com/lunce0503/flownote-service/actions/runs/40034919266): 이전 1.0.0 installer에서 프로필 보존 업그레이드, 정확한 게시물의 installer/portable 다운로드·서명·해시·재시작 캐시·동일 버전 skip 통과. updater 실행 결과는 version=1.3.1, status=ready, artifact 요청 2회이며 중복 요청이 없다.
- 첫 85개 staging gate는 83 pass / 2 fail이었다. 원인은 Playwright의 50MiB 메모리 입력 제한이며 디스크 파일 입력으로 수정했다. Windows 제목 selector도 exact로 수정했다. 미통과 소스는 운영 배포하지 않았다. 수정 후 별도 대용량 2/2와 최종 전체 gate를 확인한다.

## 웹 배포

최종 staging: `dpl_Eu9saFqhrZb6mmhhqKgieUUwnf9v`, [immutable URL](https://flownote-react-staging-i1w9gscr2-flownote-service.vercel.app), READY. 현재 최종 85개 gate 진행 중이다.

`node scripts/deploy-cloud.mjs staging web` → 네이티브 updater 검증 → 같은 receipt/source로 `production web`의 분리 단계 release 절차를 사용한다. backend 실행 코드 변경이 없어 Railway backend, 모바일 정적 웹, Expo Go 재배포는 생략한다. release 스크립트의 환경별 URL/정책 확인은 실행한다. 로컬 앱 서버·Compose는 실행하지 않았다. Docker는 cloud Playwright 및 Android 에뮬레이터 도구로만 사용했고 이 작업의 에뮬레이터를 종료했다.

운영 배포 ID·fingerprint·read-back: 최종 gate 완료 후 기록 예정.

## 남은 실기기 확인과 보관 범위

- 실제 iPad/iPhone의 Files 선택·‘파일에 저장’ 공유 시트와 Apple Pencil 본체 동작은 하드웨어 미연결로 확인하지 못했다. 기존 Pencil 모듈의 코드·archive 포함은 확인했다. TestFlight에서 1.3.0(8)로 업데이트해 실기기 확인한다.
- 책장/읽기 기록은 현재 앱 프로필·계정의 기기에 보관하며 다른 기기로 자동 전송되지 않는다. 웹 셸 시작/새로고침에는 클라우드 접속이 필요할 수 있다. 앱 삭제·저장소 회수에 대비해 원본을 별도 보관한다. 100MiB는 크기 상한이며 처리에는 추가 메모리/저장 공간이 필요하다.
- Vite 큰 번들 경고와 기존 Pencil enum exhaustiveness 경고가 있으나 빌드·archive는 성공했다. 이번 PDF 보완 때문에 Pencil 동작이나 계정/서버 권한을 변경하지 않았다.
