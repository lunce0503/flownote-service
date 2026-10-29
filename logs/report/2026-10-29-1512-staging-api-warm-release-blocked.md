# Staging API 실제 절전 해제·진단 검증·릴리스 대기

작성: 2026-10-29 15:12, 소스 정리 15:16 Asia/Seoul. 이전 [앱 관리 보고서](2026-10-29-1420-note-editing-app-release-pending.md)의 후속이다. **전체 목표/운영 승격/Android 공개 릴리스는 미완료**다. 사용자는 충전 후 알려주겠다고 답했으며 충전 완료는 아니다. 이 응답 뒤 provider 반복 조회·새 full 반복·무단 결제/키 변경을 실행하지 않는다. 작업 취소/일시정지로 해석하지 않는다.

## 소스·배포와 수정 범위

- canonical `/tmp/flownote-note-editing-20261028`, branch `codex/note-editing-20261028`, 이번 delta 기준89914017f0eab0eaae4d9843f4b50ce3f674a9ff. 부모는899 상태54파일을 공유 root에 검증 반영했다. 이번에도 root/Remote를 직접 수정하지 않았다.
- 앱 웹 runtime은 a0628ad와 동일하다. Vercel staging `dpl_2tkedvWgj14Lw9HAc37m1F9KbWzc`/6ptmx5ox1, production `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55`/이전058828a를 유지한다.
- 새 소스 지문은 `900da0efb5415c0cd75de3b7e73b58a33556524ebaddf578a99188cf69bd4647` (`scripts/deploy-cloud.mjs` 알고리즘). **이 지문에 대한 성공 receipt는 없다.** 아래 full은 진단이며 정책/배포 helper 보완 후 최종 matching gate의 대체물이 아니다.
- `cloud-resource-policy.mjs`의 staging API만 false로 변경했다. 다른 staging sleep 기본값, production always-on, Spring heap/connection pool은 유지한다. 공개 인증 gateway가 계속 가동하는 비용/가용성 정책을 사용자 요청으로 변경한 것이다.
- Docker 의존성 마운트는 source에 node_modules가 있으면 우선 선택하고, dependency-free snapshot이면 controlRoot의 node_modules로 fallback한 뒤 realpath를 read-only로 마운트한다. 같은 root의 host symlink와 feedback-auto snapshot 계약을 보존한다. 로컬 웹/API/DB 서버 fallback은 추가하지 않았다.

## 502 진단과 실제 반영

whoami 인증·프로젝트07ae56ef-08be-432d-948b-8f3b6ecb6cd5·staging7e60dd1e-4183-42b2-a88f-19be7cdd6373·API80944a75-c766-4e71-9d9a-11d3257d6083을 확인했다. 개인정보/credential을 보고서에 남기지 않았다.

부모 repeat3의 signup2실패는05:09:56.147 UTC502(4800ms, edge connection refused)와05:09:58.779 UTC502(1127ms)에 해당한다. API container는05:09:52.727 UTC에 시작해56.845 UTC에 준비됐다. 같은 구간에 private core ConnectError도 있었다. `/tmp/flownote-note-signup-edge-safe.json`, `/tmp/flownote-note-api-cold-lifecycle-safe.json`, 부모 독립 HTTP 감사가 같은 시각/상태를 확인했다.

**이 결과와 첫 익명 빈 DOM 실패의 원인을 합치지 않는다.** 과거 빈 화면의 asset/JS 증거는 없었고 이후 fresh context12/12 및 이번 full 첫 케이스가 통과했다. 원래 assertion/20초 기대를 유지한 passive asset/status/DOM 진단도 유지한다.

| 단계 | 실제 상태 |
|---|---|
| 기존 API fcaa8c8e-67d7-4f41-935f-e1dbcecde32a | SUCCESS, active manifest sleep=true |
| CLI environment edit | 성공 메시지 뒤에도 true가 관찰됨. 실제 해제 완료로 보고하지 않음 |
| redeploy8d3ce345 / c2998d6c | 이전 build/deploy 설정을 재사용해 active manifest가 여전히 true. 해제 성공 증거가 아님 |
| 서비스 인스턴스 desired 갱신 | staging API에만 sleep=false를 설정. production은 미변경 |
| canonical API 동일 소스 새 upload | **eba08ed9-31fc-4cfc-904e-c18dc513d554 SUCCESS, active manifest sleepApplication=false** |

`git diff 0c8f5ac HEAD -- flownote-API`가 비어 있음을 확인해 현재 API 소스가 이전 배포 기준과 동일함을 검증했다. shared root가 아닌 canonical API 디렉터리만 `railway up --path-as-root`로 올렸다. active builder는 기존 effective manifest와 같은 DOCKERFILE이다. API runtime 기능/DB 스키마/키를 변경하지 않았다. 새 image build와 active flag를 확인했고 이전 redeploy 성공을 적용 완료로 오인하지 않았다. 설정과 container 적용 구분은 [Railway Serverless](https://docs.railway.com/deployments/serverless), redeploy의 이전 설정 재사용은 [공식 Deployment Actions](https://docs.railway.com/deployments/deployment-actions)를 따른다.

`/tmp/flownote-note-api-warm-final-evidence.json` 및 부모 `/tmp/flownote-note-api-live-audit-parent.json`: active flag=false·gateway200·비인증 me401. 공개 gateway always-on만 변경했으므로 다른 private 서비스의 cold-start502까지 모두 제거됐다고 보장하지 않는다.

## 이번 실제 검증

| 항목 | 결과 |
|---|---|
| 899 기반 cloud128 진단 | **123 PASS / 5 FAIL,18.0분**. `/tmp/flownote-note-resume-full-8991401.log`. 첫 Android 케이스 포함 사전 이외 모두 통과. 정책/배포 helper를 실행 도중 보완했으므로 matching receipt로 쓰지 않음 |
| 남은5실패 | private library dictionary, 두 기기 WebKit dictionary,390/1440 Chromium 및820 WebKit 다의어. provider402/prepayment depleted에 따른 기존 사전 실패. skip/mock/expectation 완화 없음 |
| 실제 Windows1.3.1 설치형·포터블 | [CI40825636086](https://github.com/lunce0503/flownote-service/actions/runs/40825636086),8991401. 양쪽 native Notes·updater·entry/restart 보존 PASS. 양쪽 Reader 대기 실패가 aggregate에 남아 CI 전체는 FAIL. `/tmp/flownote-note-windows-8991401.log` |
| API 적용 후 회원 생성 | synthetic staging signup3/3 HTTP200,420/305/307ms. `/tmp/flownote-note-api-warm-signup.json` |
| API 적용 후 원래 Android 첫 시나리오 | **1/1 PASS**, 최초 로그인·세션·전체 기능·헤더/반응형·로그아웃. `/tmp/flownote-note-api-warm-android-auth.log` |
| 정책/의존성 fixture | **7/7 PASS**, source 우선·없는 snapshot의 control fallback·같은 root symlink의 실제 fixture. 부모 독립 검사도7/7. `/tmp/flownote-note-warm-policy-tests.log` |
| 실제 canonical Docker 마운트 | root의 node_modules symlink를 realpath read-only로 마운트하고 Playwright1.62.1 로드 PASS. `/tmp/flownote-note-canonical-docker-deps.log` |

이번에는 앱 입력/네이티브 updater 구현이 바뀌지 않았다. 기존 정확한 staging APK의 Android CDP 대조군/Notes와 업데이트 구간 결과는 이전 기록을 유지하며 필요 없는 재설치 반복은 하지 않았다. 물리 Android/Gboard·iPad/Pencil 검증 한계도 유지한다.

## Android 공개 전 준비

후보1.3.1(13100)의 production 서명 APK는70,536bytes, SHA-256 `f2bae34c4a4f8f0b2672e52af8ff01275b97fc7418d853ce68e3a5c1ba288f64`다. 기존 운영 signer와 동일하며 바이너리는 이번 delta에서 바꾸지 않았다. checksum과 한국어 notes를 `/tmp/flownote-android-1.3.1-release/`, `/tmp/flownote-android-1.3.1-release-notes.md`에 준비했다.

사용자 요청에 따라 최종 소스 commit/push 후 기존 `android-v1.3.1` tag/release 유무를 다시 조회하고 GitHub **draft**를 준비한다. 정확한 APK/checksum만 업로드하고 draft 상태·remote artifact를 확인해 아래에 추가한다. 권한/아티팩트 문제가 있으면 공개 우회 없이 기록한다. **draft 준비는 공개 앱 릴리스나 운영 feed 활성화가 아니다.** 현재 production Android feed는1.3.0이며 staging만1.3.1이다.

## 충전 완료 통보 후 재개

1. 기존 dedicated provider의 실제 복구와 staging 한국어 다의어 lookup을 확인한다. 추가 충전 질문·키 채팅 전송 요청·다른 키 추측·자동 결제는 하지 않는다.
2. 최신 운영/스테이징 ID와 source 상태를 다시 확인해 이미 배포된 다른 변경을 보존한다. canonical script 자체를 신뢰 control로 실행한다. **예전 reader worktree의 deploy 스크립트는 사용하지 않는다.** 그 control의 API=true 정책이 새 canonical false를 무시할 수 있다.
3. 새 frozen 지문으로 원래128 assertion 전체를 통과시킨다. 웹 runtime이 그대로이고 현재 alias가 같은 immutable 배포를 가리킬 때만 명시적으로 재사용한다. 달라졌으면 resume를 제거하고 staging부터 새로 배포한다.

```bash
cd /tmp/flownote-note-editing-20261028
FLOWNOTE_RELEASE_RESUME_DEPLOYMENTS='{"staging/web":"https://flownote-react-staging-6ptmx5ox1-flownote-service.vercel.app"}' \
RAILWAY_AGENT_SESSION=flownote-note-editing-20261028 \
node scripts/deploy-cloud.mjs staging web
```

4. 같은 소스에서 Windows Reader를 포함해 설치형/포터블 aggregate도 완료한다. 이번 native Notes 긍정 증거가 Reader 실패를 대체하지 않는다. 입력/native 변경이 생기면 해당 Android 부분도 추가 검증한다.
5. 일치하는24시간 이내 receipt와 같은 source fingerprint가 있는 뒤에만 승격한다. **현재 이 명령은 실행하지 않았다.**

```bash
cd /tmp/flownote-note-editing-20261028
RAILWAY_AGENT_SESSION=flownote-note-editing-20261028 \
node scripts/deploy-cloud.mjs production web
```

6. production alias/assets/auth/health/mobile config/8서명 feed/정확한 APK SHA·signer를 readback한다. GitHub draft의 target/artifact가 검증한 소스·바이트와 일치하는지 확인한 뒤에만 publish한다. production auto-update feed는 같은 검증된 승격으로 활성화한다. 기존 Windows/iOS 설치본의 공통 웹 반영과 새 native binary 공개를 구분한다.
7. 소유 문서/계획/보고서를 실제 완료 상태로 정정하고 commit/push한다. 현재는 active 계획을 유지하며 전체 완료나 production 배포 완료로 표시하지 않는다.

문서만 정리했다는 이유로 production gate를 우회하지 않는다. 이번 허용된 backend 작업은 staging API의 설정 적용용 동일 소스 배포뿐이며 production API/DB/canvas/다른 제품은 미변경이다. 부모는 최종 clean HEAD의899 이후 delta만 baseline guard로 공유 root에 반영한다.

최종 준비 기록: 2026-10-29 21:12 Asia/Seoul. 충전 완료 통보가 없어 provider 재조회/full 재반복/운영 승격을 실행하지 않았다. 신규 API 적용·실제123/5 진단 결과를 재사용하고 마지막 source fingerprint와 문서/릴리스 초안 준비를 정리한다.
