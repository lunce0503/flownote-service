# 노트·앱 릴리스 — 자동 사전 조회 보류

기록 시각: 2026-10-30 03:16 Asia/Seoul. 기존 application manage 세션에서 실행한다. 최종 완료: 2026-10-30 03:43 Asia/Seoul. 최종 전체129/129와 native aggregate 뒤 같은 지문으로 운영 배포·Android 공개·실제 readback을 완료했다. 사전 자동 조회는 사용자 요청대로 보류한다.

## 제품 범위와 보존

사용자 최신 지시 “일단 사전 기능은 보류하고 다른 기능을 적용해서 배포완료해”에 따라 자동 외부 사전 조회를 중지한다. 충전/새 공급자 등록은 릴리스 조건이 아니다. `temporarily_unavailable`을 명시하고 선택어 보관·기존 뜻/출처·직접 뜻과 메모·PDF 두 쪽/실제 선택·기기 OFF/ON·소유권을 유지한다. 새 노트 두 경로, 아이콘/세로 More/접힌 도구, 빠른 한 줄 편집/한글 조합, `$`/여러 줄 `$$` 수식·추천·인접 수식 보존, Android 설정 업데이트 이동이 이번 배포 범위다.

미완성 우리말샘 변경은 `/tmp/flownote-opendict-deferred-20261029-224538`의 secret-free patch/기존 파일/manifest/재개 메모에 보관했다. ec3 기준 tracked14/untracked5만 선택 복원했고 새 provider 계약을 배포에 포함하지 않았다. 사용자 root `.env`와 staging 설정은 보존한다. production 사전 키 등록/새 provider 호출/결제 변경은 하지 않는다. 에이전트 Gemini 설정과 DB schema는 변경하지 않는다.

## 소스와 검증

canonical `/tmp/flownote-note-editing-20261028`, branch `codex/note-editing-20261028`. runtime은 e1fcca5, 최종 검증 소스는 `1045afdf95d332fba92ad264bab4c7442142d8da`이다. 둘의 실행 소스 차이는 native Reader 검사의 저장 대기/API·IDB readback 보강과 Notes 실패 시에만 기록하는 수동 진단 추가이며 웹/Go/Java/APK는 같다. 현재 source fingerprint는 `2492a8d91c342592d68c7d3f86396115932bdb87535b1a94aee3abbbe8a73471`다. docs/logs/MD는 이 지문에서 제외된다.

| 검증 | 결과와 근거 |
|---|---|
| Go HTTP 경계 | 외부 transport trap red→green, 전체 Go PASS. `lookupDictionary`는 순수 보류 반환이고 runtime translator 생성/호출을 제거했다. `/tmp/flownote-dictionary-suspended-red.log`, `/tmp/flownote-dictionary-suspended-go.log` |
| 웹 lint/typecheck/build | PASS, `/tmp/flownote-dictionary-suspended-web-final.log` |
| 모델 | 93/93 PASS, skip0, `/tmp/flownote-dictionary-suspended-models.log` |
| 초기 보류 계약 전체 | e1fcca5 129/129 PASS17.7분, `/tmp/flownote-dictionary-suspended-staging.log`. 최종 검사 소스가 바뀌어 이 receipt로 승격하지 않는다. |
| 최종 frozen 전체 | 1045afd 새129/129 PASS16.6분, retries0/skip0. `/tmp/flownote-dictionary-suspended-staging-final-native.log`. 새 matching receipt verifiedAt 2026-10-29T18:38:01.249Z. |
| Windows 실제 설치형/portable | 최종1045afd [CI40929838636](https://github.com/lunce0503/flownote-service/actions/runs/40929838636) 전체 SUCCESS. 실제 기존1.3.1 설치형/portable 각각 Notes+Reader 두 PASS, signed updater/cache/profile persistence PASS. `/tmp/flownote-dictionary-paused-windows-complete.log`. |
| Android 정확한 기존 APK | PASS, `/tmp/flownote-dictionary-paused-android-readback-final.log`. 실제 staging WebView에서 현재 entry SHA, 터치/휠/Space·2쪽 glyph drag·겹침 없는 컨트롤·보류 안내·memo POST 응답/API GET/IDB pending=false/반복 보관/reload/page2·Settings1.3.1 확인. 브라우저 외부 사전 요청0. |
| 독립 실제 UI 감사 | `/tmp/flownote-paused-vocabulary-audit.log` 390 AndroidUA/1440 desktop fresh context PASS. 수동 한국어 메모/API 실제 저장/반복 보관/재로드/다른 기기/가로 넘침 없음/pageerror0. 부모 직접 screenshot 검토 및 synthetic cleanup 완료. |

### Native 저장 대기 실패의 실제 구분

40927877884 installer의 `getByText(memo).waitFor()`가 controlled textarea까지 매칭했다. `/tmp/flownote-reader-memo-diagnostic.log`의 실제 WebView 세 번 대조에서 기존 wait 반환 시 `editing=true`, rendered paragraph 없음, IDB pending=true였고 저장 ACK 전이었다. ACK 뒤 POST/GET/IDB와 rendered paragraph·반복 보관/reload는 모두 메모를 보존했다. 대기 시간 추가로 덮지 않고 실제 ACK/편집 종료/본문/API와 IDB readback으로 검사를 강화했다. runtime 데이터 유실을 확인한 것으로 과장하지 않는다.

첫 readback 구현의 Playwright APIRequestContext는 Android CDP 미지원 `Storage.getCookies`로 실패했다. 기존 동일 origin WebView 세션의 fetch로 변경하고 실제 Android에서 PASS했다. 변경 전 gate/Windows run40928927867은 중지했으며 완료 증거로 사용하지 않는다. 새 final source가 고정된 뒤 동일 런타임 배포를 명시 재사용해 전체 gate를 재실행했다.

Android 업데이트/설정과 Notes의 앞선 동일 APK 유효 증거는 `/tmp/flownote-note-android-final-hardware-retry.log`, `/tmp/flownote-note-android-canonical-final.log`다. 1.3.0→1.3.1 로그인/초안/이력·서명 다운로드/캐시·OS 설치 확인·Settings/Back·iframe/비사용자 gesture 거절·하단 바 제거 및 공간 반환, exact 중간 교체/다단계 IME·수식·저장 재로드를 확인했다. hardware=yes/IMEoff 단독 대조 실패도 과거 기록에 보존하며 물리 Gboard 검증으로 주장하지 않는다. 이번 Reader 검사는 IME/AVD 설정을 바꾸지 않았다.

## 배포와 공개 상태

staging canvas `0114caae-3edd-45ad-aa36-0143700fc0c7` SUCCESS, web `dpl_A9Xvt9aM4HzwPHkW3odeuHnUZvRg` READY / `flownote-react-staging-f1n8te4oo-flownote-service.vercel.app`. e1fcca5 이후 runtime이 같음을 git diff로 확인하고 새 gate에서 `FLOWNOTE_RELEASE_RESUME_DEPLOYMENTS`로 이 두 배포만 재사용한다. receipt는 최종 지문으로 새로 생성하며 수동 편집하지 않는다.

staging API always-on 적용 배포 `eba08ed9-31fc-4cfc-904e-c18dc513d554`/sleep=false/200·401은 유지한다. signup502의 edge→API connection refused 증거와 초기 blank DOM 미확정 원인은 구분한다. 이번 target blog는 canvas/web만 배포하며 API/main/DB/AI runtime 추가 배포는 필요하지 않다. canonical 자체 deploy script/control 정책을 사용한다.

production은 검증 전 기준 `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55` READY를 읽기 확인했다. 최종 matching receipt와 native aggregate 통과 뒤 canonical의 `node scripts/deploy-cloud.mjs production blog`로 같은 소스를 승격했다. production에 synthetic 자료를 쓰지 않았다.

GitHub 기존 draft ID427822649의 tag를 android-v1.3.1로 정확히 설정하고 target1045afd 및 사전 보류 notes를 갱신했다. 중복 release/재빌드 없이 production/readback 성공 뒤 2026-10-30 03:41:33 KST 공개했다. 실제 draft=false/publishedAt=2026-10-29T18:41:33Z, tag commit1045afd를 확인했다. [공개 Android 릴리스](https://github.com/lunce0503/flownote-service/releases/tag/android-v1.3.1).

- Android1.3.1(13100) production APK70,536bytes, SHA256 `f2bae34c4a4f8f0b2672e52af8ff01275b97fc7418d853ce68e3a5c1ba288f64`.
- 같은 버전 staging APK80,466bytes, SHA256 `1ee87d72a2a53c6d451dc9d61819a496c8dc18bc551f97d472cb657a1f563e64`.
- APK 기존 인증서 SHA256 `600a7fe351c802a22b4d8d2a90904ba34f72d9f07c575400b6473609d3a38fad`, v2 signature PASS. draft 실제 다운로드/checksum 및 GitHub asset digest 일치 확인을 보존한다.
- Windows1.3.1 기존 설치형/portable과 iOS1.3.0(8)은 공통 웹 반영 대상이며 새 native binary 빌드/출시라고 표시하지 않는다. 이번 EAS 제출은 없다.

## 제한과 후속

사전 자동 정의/번역은 사용자 명시 보류 상태이며 재개는 새 요청과 검토 후 진행한다. 물리 iPad/Pencil/Android 손가락·Gboard는 미연결이다. WebKit/Android API35 에뮬레이터/Windows 실제 runner 증거를 실물 검증과 구분한다. 공유 root와 별도 Remote 제품은 수정하지 않았고 부모가 최종 clean HEAD의 ec3 delta만 baseline guard로 반영한다. 최종 운영/공개 및 문서 상태는 아래 실제 결과가 소유한다.

추가 native 진단: 40929096199는 Reader 양쪽 PASS와 portable Notes PASS, installer Notes의 수식창 적용 뒤 inline sqrt 대기 실패를 기록했다. 기존129 실행은 중지했고 이 결과를 aggregate 성공으로 표시하지 않는다. source1045afd는 실패할 때만 합성 문서의 inline/block 값·PM JSON/selection·dialog draft·저장 상태를 기록하는 수동 진단을 추가했으며 성공 경로/timeout/assertions는 같다. 새 native40929838636은 같은 assertion/timeout과 정상 실행 경로로 양쪽 Notes+Reader/업데이트 모두 SUCCESS다. 앞선 수식 대기 실패의 원인은 재현되지 않아 확정하지 않았으며, 수동 실패 진단과 로그를 남긴다. matching full129/129는 별도로 새 지문에서 완료했다.


## 최종 운영·앱 공개 readback

- source fingerprint `2492a8d91c342592d68c7d3f86396115932bdb87535b1a94aee3abbbe8a73471`, staging verifiedAt `2026-10-29T18:38:01.249Z`, production deployedAt `2026-10-29T18:40:46.930Z`. `.release/staging-blog.json`과 `production-blog.json`은 스크립트가 생성했고 같은 revision이다.
- production canvas `de3e9c07-eb24-46a6-8e39-3226ea213394` SUCCESS, web `dpl_9m4AStCA8rCBHiZtWCaddSdidd7R` READY, immutable `https://flownote-react-729ciytgk-flownote-service.vercel.app`, alias `https://flownote-react.vercel.app`와 ID 일치. `/tmp/flownote-dictionary-suspended-production.log`, `/tmp/flownote-paused-production-web-final.json`.
- 운영 entry `/assets/index-ujRWZlWm.js` HTTP200/SHA256 `7ada9fcaba17c3dc162db98d05a18047f5df8c950590b09fd932202762d891d1`. staging 실행 entry SHA256 `feb04fd026bec8c0ec11149f6003564571618b2731bd8a742cba03da4a206b9b`와 각각 환경별 빌드임을 구분한다.
- 양 환경 합8개 feed RSA 서명·channel/platform·1.3.1, 운영/스테이징 APK 실제 크기와 SHA 일치, 인증401 및 mobile config 환경 분리 PASS. `/tmp/flownote-paused-release-readback.json`.
- 부모 독립 production 감사 `/tmp/flownote-paused-parent-production-audit.json`/`.log`: 8feed signature/no-store/frozen local bytes, 각 채널 APK versionCode13100/크기/해시, API root200/me401/mobile config·entry200, Railway canvas SUCCESS 확인. 운영 자료에는 검증용 쓰기를 하지 않았다.
- GitHub ID427822649 public/tag android-v1.3.1/target1045afd, 두 자산의 공개 다운로드 SHA·크기 및 tag commit 확인 PASS. `/tmp/flownote-paused-android-published.json`, `/tmp/flownote-paused-android-publish.log`. APK70,536bytes의 SHA는 위 운영 APK와 같다. checksum85bytes SHA256 `d271bd521037d839331df194a43022551b67445644140281f766cfc5d0fa044b`.
- 공개 URL에서 받은 APK를 다시 apksigner로 검증: v2=true, 기존 인증서 SHA256 일치. `/tmp/flownote-paused-public-apk-signature.log`. [설치 안내](https://flownote-react.vercel.app/android.html), [APK 직접 다운로드](https://github.com/lunce0503/flownote-service/releases/download/android-v1.3.1/flownote-1.3.1.apk).
- 노트/수식·사전 보류·Android 설정 업데이트·staging API always-on이 이번 사용자 범위에서 완료됐다. 기존 앱은 삭제하지 않고 업데이트하며 설치 확인은 OS UI를 따른다. Windows/iOS는 공통 웹 반영이며 새 native 버전/EAS 제출이 아니다.

소유 제품/앱 문서와 두 실행 계획을 실제 완료 상태로 정정하고 완료 계획으로 이관한다. 기존 active URL은 완료 위치를 가리키는 stub으로 보존한다. 최종 docs/logs/MD 정리는 실행 지문을 바꾸지 않으므로 이 배포와 검증을 반복하지 않는다. source 및 문서 delta는 같은 branch에 commit/push하고 부모가 ec3 baseline guard로 공유 root에 반영한다. secret·서명키·사용자 원본 데이터는 보고서/commit에 포함하지 않는다.

롤백 기준은 이전 web Ready `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55` 및 이전 canvas `34252ac2-7d9b-43a6-b00b-a40f4acb3c92` 기록이다. 실제 롤백은 수행하지 않았다. 자동 사전 조회를 되살리는 구 runtime으로 돌아가는 것은 새 사용자 보류 계약을 깨므로 단순 재활성화하지 않고 해당 경계를 유지한 수정으로 복구한다. Android는 같은 인증서의 더 높은 수정 버전으로 대응하며 사용자 앱/자료를 삭제하지 않는다.

완료 문서 검증: 변경 MD12개 기준 로컬 링크39개/누락0, JS helper 두 개 syntax 및 git diff --check PASS. docs/logs 정리 뒤에도 실행 fingerprint2492a8d9가 receipt와 일치한다. 추가 빌드/129개/운영 배포를 반복하지 않았다. 최종 HEAD에는 소유 문서/보고서만 추가되며 release tag는 실제 검증한1045afd 코드 커밋을 가리킨다.
