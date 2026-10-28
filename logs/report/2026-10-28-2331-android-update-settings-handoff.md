# Android 업데이트 설정 이동 — 통합 전 인계

작성: 2026-10-28 23:31, 핵심 에뮬레이터 PASS 확인 23:36 Asia/Seoul. 이 보고서는 Android 독립 구현 단계의 기록이다. 현재 native 소스의 핵심 회귀는 완료했다. 전체 노트 편집 목표와 앱 운영 배포는 아직 완료되지 않았으며 부모의 병렬 소스 통합을 위한 작업 분담에 따라 scoped commit을 먼저 전달한다.

## 소스와 소유 범위

- worktree `/tmp/flownote-note-native-20261028`, branch `codex/note-native-20261028`, 기준 `058828a0534ba9b161232d5cbfe6dcc70bca5496`.
- 부모 웹 후보 `/tmp/flownote-note-editing-20261028`, 마지막 인계 `9eda439` (`28351c9`의 MathComposer 접근성 보완 포함). 이 작업은 부모 작업 트리, 공유 root, NoteEditor/LiveMarkdownEditor/CanvasList/수식 모델, Remote 제품을 수정하지 않았다.
- 변경: Android `MainActivity`/`AppUpdater`, 고정 진입 정책과 JVM 검사, Settings의 업데이트 전용 컴포넌트와 import/배치 두 줄, Android 검증 스크립트·앱 소유 문서·버그 기록. 공개 APK/feed/안내 페이지는 아직 변경하지 않았다.

## 구현과 보안 검토

AppUpdater는 부모 레이아웃에 네이티브 바를 추가하지 않는다. 앱 설정에서 설치 버전과 live 상태를 보고 고정 링크로 네이티브 관리 창을 열어 수동 확인·설치·변경 내용·최근 이력을 조회한다. 관리 창은 작업 중에도 열려 있고 상태/버튼을 갱신한다. 설치 버전 확인도 기존 private 이력에 남긴다. 닫기/Android Back은 웹 설정으로 돌아간다.

범용 JavascriptInterface, URL/파일/명령 입력, 토큰 전달은 없다. 고정 앱 HTTPS origin의 `/settings`에서 main-frame·실제 사용자 gesture·GET·정확한 `/__flownote_native__/updates` 요청만 소비한다. target query/fragment, 다른 origin/port, iframe, script-only 요청을 거부한다. native→web에는 schema/설치 버전/채널/상태/준비된 버전의 표시 데이터만 전달하며 React는 텍스트로 렌더한다. 표시 데이터는 신뢰/인증 판정에 사용하지 않는다.

RSA feed 공개키, APK 공개 서명 인증서, feed/파일 크기 제한, SHA-256, package/version/versionCode/signer 대조, 채널/고정 다운로드 origin, highest-code rollback 방어와 설치 직전 재검증은 보존했다. 자동 시작/재개/시간 주기 확인·다운로드·검증 캐시·OS 설치 허용 및 확인 흐름도 유지한다. 사용자 자료나 WebView 저장소 삭제를 추가하지 않았다.

새 웹+기존 앱은 기존 하단 업데이트 버튼 안내를 표시하고 지원되지 않는 native URL을 노출하지 않는다. 새 APK 공개는 새 설정 카드를 포함한 실제 staging 통합 검증 후 진행한다. 웹 롤백은 설정 계약을 보존하며 APK downgrade 대신 더 높은 수정 버전을 사용한다.

## 빌드·정적/단위

- `yarn verify` PASS: `/tmp/flownote-note-native-web.log` (lint/typecheck/Vite production build).
- `node scripts/test-app-updates.mjs` PASS: `/tmp/flownote-note-native-policy.log`. Node updater 7/7, skip0. Android JVM 기존 서명/채널/URL/버전 정책과 새 설정 진입(HTTPS/settings/main frame/gesture/GET/무인자) 검사 PASS.
- Android `assembleDebug assembleRelease lintRelease` PASS: `/tmp/flownote-note-native-build.log`. lint `No issues found`. 테스트용 낮은 버전 APK도 빌드했고 이후 기본 1.3.1 debug 빌드를 다시 성공시켰다: `/tmp/flownote-note-native-final-debug-build.log`.
- 초기 낮은 버전 fixture 명령은 ANDROID_HOME을 생략해 SDK location 오류가 났고 환경 지정 후 성공했다. SDK/서명키/비밀번호는 보고서나 CLI 인자에 기록하지 않았다.
- `apksigner verify --verbose --print-certs` PASS. 1.3.1 release와 기존 공개 1.3.0의 공개 인증서 SHA-256은 동일: `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`.

## 후보 바이너리 (아직 미공개)

실제 production/staging feed를 읽어 모두 1.3.0(13000)을 확인한 뒤 후보를 **1.3.1(13100)**으로 증가시켰다.

| 종류 | 경로 | 크기 | SHA-256 |
| --- | --- | --- | --- |
| 기존 운영 키 서명 release | `/tmp/flownote-note-native-1.3.1.apk` | 70536 bytes | `c43a161ad25f66d7809e2ee85ab46390eeaf2de3c986d9698fb9f1bd72cabcb6` |
| staging debug | `/tmp/flownote-note-native-1.3.1-staging.apk` | 80466 bytes | `1ee87d72a2a53c6d451dc9d61819a496c8dc18bc551f97d472cb657a1f563e64` |

설치/다운로드 회귀용 `/tmp/flownote-note-native-update-fixture.apk`는 같은 후보 구현에 debug-only `testVersionCode=12999`, `testVersionName=1.2.99`를 적용했다. 공개용이 아니다. 기본 Gradle output은 마지막 정상 1.3.1 빌드로 복원했다. 통합 이후 앱 관리가 canonical 후보에서 바이너리·서명 feed·안내를 함께 준비하고 동일 소스로 staging→production한다.

## 에뮬레이터 검증

API35 Android 시스템 WebView를 실제 APK로 실행했다. 로컬 제품 웹/API/DB/Compose 서버는 실행하지 않았다. ADB/CDP만 테스트 전송이며 제품 요청은 cloud staging이다. 테스트 계정/데이터는 staging에만 생성했다.

새 웹은 아직 배포하지 않았으므로 `--inject-candidate-settings`가 실제 후보 React 컴포넌트를 현재 cloud Settings 화면에 CDP로 마운트한다. 이것은 실제 통합 staging 배포나 전체 128개 gate의 증거가 아니다. 핵심 전체 실행 PASS 로그: `/tmp/flownote-note-native-settings-smoke-prior-pass.log`.

- 기존1.3.0 앱+새 설정 카드 fallback, 전체 메뉴→설정 진입 PASS.
- 테스트용 낮은 버전의 새 updater 구현으로 실제 cloud APK 다운로드 시작/완료, SHA-256/native signer 검증, 프로세스 재시작 후 동일 캐시 mtime 재사용, 무인 설치 없음, 실제 OS 설치 확인 후 버전 변경 PASS.
- 실제1.3.0→1.3.1 후보 교체 후 로그인·초안·업데이트 이력 유지, 상태 갱신/수동 확인/더 낮은 feed 설치 방지, native 창 Back/닫기/재진입 PASS.
- native alertTitle을 기준으로 iframe과 사용자 활성 상태 없는 script 요청이 창을 열지 못함을 확인했다. Playwright evaluate 자체가 userGesture를 부여하므로 그 transient activation 만료를 먼저 CDP로 확인한 뒤 userGesture=false 요청으로 검증했다. 실제 링크 클릭은 실제 mouse input으로 검증하고44px 이상 hit area를 확인했다.
- 아래 두 화면을 직접 열어 카드/버튼/이력/닫기/확인 버튼의 잘림·겹침 없음을 확인했다: `/tmp/flownote-note-native-settings.png`, `/tmp/flownote-note-native-update-dialog.png`.

추가 설치 허용 경로는 기존 허용 상태에 의존하지 않도록 synthetic test package의 install app-op만 revoke한 뒤 실제 시스템 설정 switch를 거치는 새 실행을 진행 중이다: `/tmp/flownote-note-native-settings-smoke.log`. native 실행 코드는 핵심 PASS 이후 바뀌지 않았다. 이 추가 검증을 생략하지 않으며 부모 웹 통합 및 staging 실행과 병행해 최종 결과를 기록한다. 에뮬레이터 컨테이너 `flownote-note-native-emulator`를 재사용하고 중복 실행하지 않는다. 물리 기기 검증은 아니다.

이미 실제 측정한 후보 WebView bounds는 기존 `[0,63,1080,1731]` → 새 앱 `[0,63,1080,1857]`이며 **126 물리 px(48dp)**가 웹에 반환되었다. innerHeight 684 CSS px × DPR 2.625와 새 native WebView 높이1794px가 일치한다. width/documentWidth 모두412px여서 가로 넘침이 없다.

중간 테스트 실패는 숨기지 않았다. 부팅 후 기존 System UI ANR를 닫고 다시 실행했다. inline test script는 CSP에 막혀 CDP 실행으로 교체했고 제품 CSP는 그대로다. native가 소비한 고정 경로는 브라우저 load event가 없어 Playwright locator의 navigation wait가 완료되지 않는다. 따라서 실제 mouse input→native alertTitle·기존 URL·DOM을 직접 확인하도록 테스트 전송을 고쳤다. 웹 카드 h2와 native alertTitle을 구분했고, OS 설치 완료 화면을 닫고 지연 종료된 프로세스를 다시 열도록 ADB/CDP 연결을 보완했다. 기대 동작/보안 assertion을 제거하거나 skip하지 않았다. 실패 로그는 `/tmp/flownote-note-native-settings-smoke-attempt*.log`에 보관한다.

## 아직 수행하지 않은 단계

부모가 병렬 소스를 안전하게 통합하기 위해 요청한 작업 분담에 따라 staging/prod 배포와 공개 피드 갱신을 아직 시작하지 않았다. 이는 사용자의 전체 배포 목표를 중단하거나 추가 승인을 요구하는 절차가 아니다. 현재 운영 web은 `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55`, Android feed는 여전히1.3.0이다. 이 소스는 부모가 scoped commit을 cherry-pick하고 통합 작업권을 다시 인계한 후 다음을 진행한다.

1. 9eda439 웹 후보+native scoped commit을 고정하고 전체 정적/단위 검증 및 새128개 cloud gate를 실행한다. 이전116개 통과 기록을 이번 증거로 대체하지 않는다.
2. 새 Android APK/서명 feed/안내를 통합 소스에 준비한다. 실제 staging 웹에서 `settings-update-smoke.mjs`를 주입 옵션 없이 다시 실행해1.3.0→1.3.1 업그레이드·보존·설정·새 노트/IME/수식을 검증한다.
3. Windows1.3.1 설치형/포터블에서 생성·중간 선택 교체·IME 종료·Home/End·Delete/Backspace·Enter·undo/redo·수식 추천/다중행·저장/재로드를 실제 실행한다. iOS1.3.0(8)은 공통 웹 영향과 WebKit을 검증하고 물리 iPad/Pencil 미연결 한계를 구분한다.
4. `node scripts/deploy-cloud.mjs release web`의 staging-first와 matching receipt/same-source production을 지킨다. API/DB/canvas 실행 소스는 이번 scope에 변경이 없으므로 관련 없는 backend/Remote를 배포하지 않는다.
5. 실제 배포 ID/health/source 지문/다운로드/서명/앱 업데이트 경로를 읽기 전용으로 확인하고 소유 문서·계획·최종 report를 정정·commit/push한다. 아직 전체 목표 완료로 표시하지 않는다.
