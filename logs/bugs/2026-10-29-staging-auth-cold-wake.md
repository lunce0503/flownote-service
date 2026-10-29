# Staging 회원 생성의 cold-wake502와 익명 첫 빈 화면 구분

## 증거와 원인

2026-10-29 14:09 KST 부모 repeat3의 회원 생성2실패는 Railway HTTP 로그의 `/api/users` POST 05:09:56.147 UTC502(4800ms, edge upstream connection refused) 및05:09:58.779 UTC502(1127ms)와 일치한다. API container는05:09:52.727 UTC에 시작해56.845 UTC에 Uvicorn startup complete를 기록했다. 같은 시각 private core 연결의 ConnectError도 기록됐다. `/tmp/flownote-note-signup-edge-safe.json`, `/tmp/flownote-note-api-cold-lifecycle-safe.json`. 요청 본문/계정/자격 증명은 기록하지 않는다.

이는 별도의 빈 DOM/login URL 대기 실패와 같은 원인이라고 판단하지 않는다. 그 실패의 JS/asset 진단은 당시 없었고 이후 부모 fresh context12/12, 현재 전체 진단의 첫 Android 케이스 및 API 적용 후 첫 시나리오는 통과했다. 기존 assertion/timeout과 수동적인 asset/DOM 준비 진단을 유지한다. 입력값400 검사는 auth-security의 의도된 실패이며 cold-wake502와 구분한다.

## 수정과 실제 적용

사용자 요청으로 기존 `scripts/cloud-resource-policy.mjs`의 staging API만 false로 바꾼다. 다른 staging 앱·production 정책·Spring 리소스 계약은 유지한다. CLI environment edit의 성공 메시지 뒤에도 원하는 false가 확인되지 않아 실제 서비스 인스턴스 설정을 갱신했다. 기존 redeploy는 이전 설정까지 재사용해8d3ce345/c2998d6c 배포 메타가 여전히 true였다. 이 두 시도를 성공 증거로 사용하지 않는다.

API 소스가0c8f5ac와 동일함을 `git diff 0c8f5ac HEAD -- flownote-API`로 확인한 뒤 canonical API 폴더만 새 upload했다. 활성 `eba08ed9-31fc-4cfc-904e-c18dc513d554` SUCCESS, 실제 메타 `sleepApplication=false`, `/`200·`/api/users/me`401을 확인했다. source/config/active container를 구분한다. 운영 API는 변경하지 않았다.

## 검증과 남은 항목

- 정책·dependency layout 단위7/7 PASS. 같은 root의 symlink와 의존성을 제외한 source snapshot의 control fallback, candidate 우선 선택을 실제 임시 디렉터리로 검사했다.
- API 적용 후 signup3/3 HTTP200(420/305/307ms), 첫 Android 전체 로그인 시나리오1/1 PASS.
- 현재 full 진단은123PASS/5FAIL이며 모두 기존 사전 provider 차단이다. 정책/배포 스크립트를 실행 도중 보완했으므로 최종 소스 matching receipt가 아니다.
- API always-on은 공개 gateway의 cold-wake 조건을 줄인다. 다른 private 서비스의 sleep은 유지하므로 모든 upstream cold-start502가 제거됐다고 보장하지 않는다. 첫 빈 화면의 확정 원인도 미확인이다.
- 사용자는 충전 후 알려주겠다고 답했다. 완료 통보 전 provider 반복 조회·새 full 반복·production 승격·Android 공개를 하지 않는다. 최종 소스를 고정해 회복 후 전체128/Windows Reader를 다시 완료한다.

최신 결과와 정확한 재개 명령은 [후속 보고서](../report/2026-10-29-1512-staging-api-warm-release-blocked.md)를 따른다.
