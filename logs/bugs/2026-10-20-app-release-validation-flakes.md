# App release validation observations

## Cloud pointer tests

최종 앱 feed staging gate 첫 실행에서 55개 중 53개가 통과했고 기존 `cloud.spec.ts`의 canvas drawing/copy 테스트가 visible line count 0으로 실패했다. 검증한 화면은 pen 선택·빈 canvas였다. 앱 updater·guide·정적 feed 외 웹 기능 소스는 최초 52/52 통과 때와 같다. 네트워크/이벤트 타이밍 등 원인은 확정하지 않았다.

같은 immutable staging deployment `dpl_5nq3GrWCFwWG32Zxvo8ZeNo4Jpas`에서 두 테스트를 각각 3회 반복했고 6/6 통과했다. 테스트를 약화하거나 제품 canvas 코드를 수정하지 않았다. 전체 55개 gate를 같은 deployment/source로 다시 실행하며 통과 전 production 승격은 금지한다. 재현이 계속되면 pointer event·active tool·render readiness와 저장 요청을 별도 수집한다.

## Windows test context

추가 runner `39365465978`은 설치형 smoke를 통과했으나 portable 초기 쿠키 제거 직후 legacy localStorage evaluate가 로그인 redirect와 경합해 execution context destroyed로 종료됐다. DOM evaluate 대신 쿠키 제거 후 login 전체 navigation을 사용하도록 테스트 fixture를 정정했다. 앱 runtime 변경은 없다.

실제 packaged networking 검사 `39365683978`은 Playwright main evaluate에서 lexical `require`가 없어서 실패했다. Node global `process.getBuiltinModule('node:module').createRequire(...)`로 같은 packaged updater 모듈을 로드하도록 검사만 정정한다. 웹 renderer에는 require/bridge를 노출하지 않는다.

## Android test tooling

ATD UIAutomator dump가 한 차례 exit 137로 종료됐다. 최신 dump가 성공했다는 응답을 확인하고 transient 137만 제한적으로 재시도한다. 오래된 XML 좌표는 사용하지 않는다. installer 판정도 activity history 전체가 아니라 실제 topResumedActivity로 제한한다. 이는 테스트 도구 수정이며 Android 앱의 설치 승인 정책을 바꾸지 않는다.
