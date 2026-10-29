# 노트 편집·Android 업데이트 설정 — 검증 결과와 운영 보류

**후속 완료 정정:** 아래는 당시 차단/진단 기록이다. 사용자 명시 요청으로 사전 자동 조회를 보류하고 다른 기능을 배포했으며, 현재 상태는 [최종 운영·앱 공개 기록](2026-10-30-0316-note-app-release-dictionary-paused.md)이 소유한다. 과거 충전 대기 조건은 이번 릴리스에 적용하지 않는다.

작성: 2026-10-29 14:20, 최종 입력 검증 보강 14:31 Asia/Seoul. 기존 application manage 세션의 통합 작업 기록이다. **전체 목표 미완료, production 승격 및 Android 공개 릴리스 미완료**다. 충전 응답 없이 provider를 무한 재조회하지 않고, 확인한 소스/검증과 남은 재개 절차를 정리한다. 결제·키 변경, 테스트 skip/mock, production 시험 데이터 쓰기를 실행하지 않았다.

후속 상태: [staging API 실제 절전 해제·123/5 진단·최신 재개 절차](2026-10-29-1512-staging-api-warm-release-blocked.md)가 이 기록을 보완한다. 아래8991401 지문/검증은 당시 기록이며 최종 소스 matching receipt가 아니다. 충전 완료 통보 전 승격하지 않는다.

## 소스와 실제 배포

- canonical: `/tmp/flownote-note-editing-20261028`, `codex/note-editing-20261028`. 부모 웹28351c9/9eda439와 native3779bd4를 통합하고 후속 수정을 push했다. 마지막 앱 runtime 소스는 `a0628ad2676ad32bd4b26e21550b3e311c3391ca`다. 이번 정리는 검사 드라이버·진단·소유 문서만 바꾸며 웹/Java runtime 및 APK 바이트는 바꾸지 않았다.
- staging: `dpl_2tkedvWgj14Lw9HAc37m1F9KbWzc`, READY, `https://flownote-react-staging-6ptmx5ox1-flownote-service.vercel.app`, alias `https://flownote-react-staging.vercel.app`.
- production: 이전 `058828a` / `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55`, READY, `https://flownote-react.vercel.app`. 이번 기능을 운영 반영했다고 표시하지 않는다.
- staging 배포 당시 전체 소스 지문: `e4019c5cbd49298cc4433822790ca6268671fb5a5f52373c7e40299f3078fad8`. 이번 검사 보강 후보 지문: `3ddb7a6312862b783090a24b9e6924bb78567d5b84e5882dd1be4dfe9fcf8182` (`scripts/deploy-cloud.mjs` 방식). **통과 receipt는 없다.** MD/docs/logs는 이 지문에서 제외되며 최종 소스는 이 보고서가 속한 git HEAD로 확인한다.
- 공유 root 및 Remote 제품은 수정하지 않았다. 부모는 최종 clean HEAD를 받은 뒤 baseline guard로 scoped 반영한다.

## 구현과 검증

prompt 없는 두 새 노트 생성, 이름 있는 아이콘/접힌 편집 도구/세로 More, 사용자 `$`·여러 줄 `$$` 입력·추천·HTML 수식창, 빠른 단일 시각 줄 Home/End, Android 업데이트 설정 이동을 구현했다. Tiptap 옵션을 안정화했고 연속 inline math를 직렬화할 때 공백으로 구분해 원문/주변 문자/재로드/미리보기를 보존했다. 열기만으로 원문을 다시 저장하지 않으며 기존 초안·충돌·OFF/ON 보존 검사를 유지했다.

| 검증 | 실제 결과/근거 |
|---|---|
| 프런트 lint/typecheck/build | PASS, `/tmp/flownote-note-closeout-verify.log` (34.79초). 최초 root에서의 `yarn verify`는 package.json 없음으로 실패했으며 올바른 `flownote/`에서 재실행했다. |
| 모델 | 93/93 PASS, skip0, `/tmp/flownote-note-closeout-models.log` |
| updater 정책 | Node7/7 및 Android JVM 버전/채널/서명/고정 설정 동작 PASS, `/tmp/flownote-note-closeout-updates.log` |
| Android 빌드 | assembleDebug/assembleRelease/lintRelease PASS, `/tmp/flownote-note-integrated-android-build.log`; Java 변경 없이 최종 release APK v2 서명 재검증 PASS |
| 새 노트 cloud 집중 | a0628ad 12/12 PASS, retries0, `/tmp/flownote-note-focused-navigation-math.log` (부모 독립 실행). 390/1440 Chromium·820 WebKit의 두 생성/폴더 실패 보존/아이콘·도구/빠른 Home·삭제·IME·undo·수식·저장/재로드를 확인했다. |
| 실제 화면 | `/tmp/flownote-note-focused-navigation-math/`의390/820/1440 수식 화면과390 compact 화면을 직접 검토했다. frac/sqrt 정상, Pair/tail 보존, KaTeX 오류0·가로 넘침 없음. |
| 전체 cloud | **122 PASS / 6 FAIL**, `/tmp/flownote-note-staging-navigation-math.log` (17.5분). 이전116개를 이번 증거로 사용하지 않는다. |
| Windows 실제 설치형·포터블 | [CI40793742263](https://github.com/lunce0503/flownote-service/actions/runs/40793742263), a0628ad. 양쪽 `PASS native notes` 로그를 직접 확보했다. updater 자동 다운로드/캐시·staging entry 해시·재시작/로그인/초안 보존도 PASS. aggregate는 양쪽 기존 Reader에서 실패하므로 전체 CI PASS로 표시하지 않는다. `/tmp/flownote-note-windows-navigation-math.log`. |
| 익명 진입 재검사 | 진단 보강 뒤 원래 Android 전체 시나리오 repeat3은3/3 PASS, `/tmp/flownote-note-anonymous-status-diagnostic.log`. 이전 실패를 해소했다는 증거로 과장하지 않는다. |

전체128 중5실패는 기존 사전의 한국어 다의어 결과를 받지 못한 실패다. provider 공식 API의402 `RESOURCE_EXHAUSTED`, prepayment depleted를 확인했고 실제 lookup은503이다. 부모의 최신2026-10-29 14:10 KST 읽기 재조회도 동일했다(`/tmp/flownote-note-provider-status-20261029.json`). 비밀값은 기록하지 않았다. 사용자 충전 응답은 아직 없다.

나머지 전체1실패는 첫 Android 익명 `/`에서 빈 DOM/login URL 대기20초 실패다. 부모 repeat3의2실패는 이와 다른 회원 생성 `signup.ok()` 실패였고, 호스트 signup3회는200이었다(`/tmp/flownote-note-anonymous-audit-20261029.log`, `/tmp/flownote-note-signup-audit-20261029.json`). 원인은 미확정이다. 기존 기대/timeout을 유지한 채 초기 자산 경로·응답 상태·요청 실패 종류·JS 오류 종류·DOM 준비 상태만 수동적으로 수집하도록 보강했다. 쿠키/본문/쿼리/로그인값은 수집하지 않는다.

## Android 동일 APK의 실제 증거

- 공개 staging APK `flownote-1.3.1-staging.apk`: 80,466 bytes, SHA-256 `1ee87d72a2a53c6d451dc9d61819a496c8dc18bc551f97d472cb657a1f563e64`. 실제 feed/다운로드/canonical 바이트가 일치한다.
- production 서명 후보 `flownote-1.3.1.apk`: 70,536 bytes, SHA-256 `f2bae34c4a4f8f0b2672e52af8ff01275b97fc7418d853ce68e3a5c1ba288f64`. 기존 운영 인증서 SHA-256 `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`와 동일하다. 이 파일은 준비된 후보이며 운영/GitHub 공개 완료가 아니다.
- `/tmp/flownote-note-android-final-hardware-retry.log`: 주입 옵션 없이 새 cloud Settings·기존1.3.0 fallback·서명된 자동 다운로드/해시/서명/재시작 캐시·실제 설치 허용 시스템 설정 및 OS 설치 확인·1.3.0→1.3.1 로그인/초안/이력·수동 확인·Back/닫기·iframe/비사용자 gesture 차단·downgrade 차단·하단 바 제거가 PASS다. WebView bounds는 `[0,63,1080,1731]`→`[0,63,1080,1857]`,126물리px(48dp) 반환,412px 폭 넘침 없음.
- 앞선 `/tmp/flownote-note-android-final-hardware.log`는 에뮬레이터 재부팅 뒤 **System UI isn't responding** 시스템 창으로 native view bounds를 얻지 못해 실패했다. Flownote ANR라고 단정하지 않는다. 시스템 창의 Wait를 누른 뒤 위 실행을 별도로 기록했다.
- 위 retry는 Settings가 소비한 고정 native navigation의 Playwright pending 상태 때문에 새 대조군 locator에서 실패했다. 이 native 동작은 이력에 진입하지 않는 기존 계약이다. 후반 입력 검사 전에 실제 cloud `/blog`로 이동해 그 상태를 해소하도록 드라이버를 수정했다. 실패를 전체 통과로 표시하지 않는다.
- 최신 `/tmp/flownote-note-android-final-integrated.log`도 업데이트/설정 구간은 PASS지만 순차 CDP 대조군 iteration2에서 중복돼 전체 실행은 FAIL이다. 이를 숨기지 않는다. 이후 동일 설치 APK에서 입력 부분만 검증했고 `/tmp/flownote-note-android-canonical-final.log`는 **현재 canonical 드라이버의 대조군5/5·Notes 전체 PASS**다. 설치 base.apk의 SHA-256을 ADB로 직접 읽어 공개/canonical staging APK와 일치함을 확인했다. 업데이트 전 구간을 더 반복하지 않고 실행별 증거를 구분한다. 단일 전체 native 실행 PASS나 전체128 PASS로 표시하지 않는다.

IME 분리 결과는 다음처럼 구분한다.

| 입력 환경/전송 | 실제 결과 |
|---|---|
| soft/hardware 설정 없는 순차 CDP | React 없는 동일 중간4글자 선택에서도5회 중4회 중복. `/tmp/flownote-android-ime-control-matrix.log` |
| hw.keyboard=yes + 화면 IME 옵션0 | 최초 대조군5/5와 Notes 단독 PASS였으나 후속 통합 iteration2에서 중복 재현. 하드웨어 모드 단독 해결로 판단하지 않는다. |
| 외부 IME 비활성화 + 순차 CDP | iteration2에서 한한글·조합 종료/재시작 재현. `/tmp/flownote-note-android-ime-isolated.log`. 앱 내부가 원인이라는 증거가 아니다. |
| 동일 세 명령을 같은 연결 순서로 pipeline 전송 | 대조군15/15·Notes 전체 PASS. `/tmp/flownote-note-android-ime-pipeline.log`는 임시 비교 드라이버다. |
| canonical에 반영한 Android pipeline 드라이버 | 대조군5/5·실제 Notes 전체 PASS. `/tmp/flownote-note-android-canonical-final.log`. 한→한글 다단계 입력, 정확한 중간 교체 문자, 조합 시작/종료1회, 저장/재로드·수식·미리보기 오류0 모두 유지. |

원래 `imeSetComposition(한)`→`imeSetComposition(한글)`→`insertText(한글 )` 명령과 순서·문자·검사 조건은 유지했다. Android에서 호스트 round trip을 단계 사이에 기다리지 않도록 전송만 pipeline으로 바꾸며 Windows는 기존 순차 전송을 유지한다. Space commit 실험은 채택하지 않았다. 새 제품 구조/앱 runtime 변경/합성 DOM 조합 이벤트/고정 지연을 추가하지 않았다. 순차 전송과 pipeline의 관측 차이이지 Android 내부 원인을 확정한 결과가 아니다. 실제 Gboard/물리 입력과 iPad/Pencil 검증은 여전히 남아 있다.

임시 IME 비활성화 실험은 복원 시 subtype 구분 세미콜론을 원격 셸이 명령 separator로 해석해 exit127이 났다. **`subprocess` 인자 배열만으로 `adb shell` 원격 인용이 보장되지 않는 실수였으며 `shlex.join`으로 바로 복원했다.** enabled/default/화면 키보드 설정 모두 원래 값과 일치함을 readback했다. AVD의 원래 `hw.keyboard=no`도 복구하고 재부팅 후 설정 파일의 no 및 QEMU hardware keyboard=false를 readback했다. Android resource config는 여전히 qwerty를 보고하므로 이를 nokeys와 같다고 가정한 최초 원복 검사는 실패했고, 원래 AVD/QEMU 값과 입력기 설정을 직접 확인하도록 정정했다. 검증 진입 guard도 AVD 파일과 QWERTY를 함께 확인한다. `/tmp/flownote-note-emulator-restoration.json`에 공개 APK 해시와 설정 일치 boolean만 기록하며 입력기 설정 원문·사용자 자료·자격 증명은 보고서에 넣지 않는다.

## 읽기 전용 readback

`/tmp/flownote-note-closeout-readback.json` (14:19 KST): 두 alias의 entry JS200/해시, 인증401, 환경별 mobile config, **8개 feed의 RSA 서명**을 직접 검사했다. staging entry SHA-256은 `b441a8ef519a03179082d4411cd6314b41e3771630ed4321f2840a343c3a0955`, 기존 production은 `d4d2095287a2fad50c1084f0cdf14fcfa0a7228ea3668649ce8b3a31a62bd7da`다. staging Android1.3.1, production Android1.3.0(13000) 다운로드 해시가 각각 자기 signed feed와 일치한다. Windows는 기존1.3.1을 유지한다. 기존 iOS1.3.0(8)은 공통 웹 영향만 WebKit로 확인했으며 새 EAS/TestFlight 빌드를 실행하지 않았다. 물리 iPad/Pencil·실제 Android 키보드/손가락 검증은 남아 있다.

## 실행하지 않은 승격과 다음 조치

1. 사용자 충전/외부 provider 회복 통보 후 기존 전용 설정의 공식 제공자와 실제 staging 한국어 다의어 lookup을 다시 확인한다. 키를 채팅/로그에 받거나 출력하지 않는다. 결제/키 변경은 실행하지 않았다.
2. 검사 소스 변경으로 지문이 달라졌으므로 **새 전체128 gate가 필요**하다. 웹/Go/Java runtime과 APK는 a0628ad와 같아 현재 immutable staging ID를 명시적으로 재사용할 수 있다. 런타임을 다시 고치면 새 staging 배포부터 수행한다.

```bash
FLOWNOTE_RELEASE_SOURCE_ROOT=/tmp/flownote-note-editing-20261028 \
FLOWNOTE_RELEASE_RESUME_DEPLOYMENTS='{"staging/web":"https://flownote-react-staging-6ptmx5ox1-flownote-service.vercel.app"}' \
RAILWAY_AGENT_SESSION=flownote-note-editing-20261028 \
node /tmp/flownote-note-editing-20261028/scripts/deploy-cloud.mjs staging web
```

canonical 스크립트 자체를 신뢰 control로 사용한다. 예전 reader worktree의 스크립트는 옛 API=true 정책을 다시 적용할 수 있어 사용하지 않는다. Docker 의존성은 source 우선/control fallback을 realpath로 마운트한다. 로컬 앱 서버는 시작하지 않는다. 이전122/6이나 독립12개를 성공 receipt로 대체하지 않는다.

3. 같은 후보 Windows installer/portable Notes와 **Reader까지** CI를 완료한다. 기존 Reader402 실패를 삭제/skip하지 않는다. 익명 첫 케이스가 다시 실패하면 새 passive 진단의 HTTP/asset/DOM 상태를 근거로 원인을 수정하고 전체 gate를 다시 실행한다.
4. 일치하는 `<24시간` receipt가 생긴 뒤에만 다음 승격을 실행한다. 현재는 receipt가 없고 provider 차단이 있어 **실행하지 않았다**.

```bash
FLOWNOTE_RELEASE_SOURCE_ROOT=/tmp/flownote-note-editing-20261028 \
RAILWAY_AGENT_SESSION=flownote-note-editing-20261028 \
node /tmp/flownote-note-editing-20261028/scripts/deploy-cloud.mjs production web
```

5. production alias/자산/health/auth/mobile config/8서명 feed·APK 해시·서명을 읽기 전용으로 확인하고 Android 기존 채널 `android-v1.3.1`에 정확한 운영 서명 APK와 checksum을 공개한다. 새 Windows/iOS 바이너리 릴리스로 과장하지 않는다. 계획/앱 문서/이 기록을 완료 상태로 정정하고 commit/push한다.

문서 전용 정리를 이유로 production gate를 우회하지 않았다. API/DB/canvas/AI/native runtime 추가 배포는 이번 변경에 필요하지 않아 생략했다. 기존 운영 데이터에는 시험 쓰기를 하지 않았으며 부모가 공유 root에 반영하는 절차는 운영 배포와 별개다.

최종 정리 검증: 변경 문서의 로컬 링크22개 누락0, native/공유 입력 드라이버3개 JS syntax 검사 및 git diff --check 통과. 입력기3설정의 원래 값 일치·AVD no/QEMU false 원복을 확인했다. 앱 runtime을 바꾸지 않은 검사 보강은 새 전체 gate 전용 소스 지문에 반영했다. 운영 승격은 계속 보류한다.
