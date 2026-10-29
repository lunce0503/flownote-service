# 자동 사전 조회 보류와 단어장 보존

사용자는 2026-10-29 “일단 사전 기능은 보류하고 다른 기능을 적용해서 배포완료해”라고 명시해 제품 범위를 변경했다. 이전 Gemini402/우리말샘 품질 조건을 숨기거나 mock으로 우회하지 않는다. 새 계약은 외부 조회0·명시적 보류 상태·단어/직접 메모/권한/원본 보존이다.

## 구현과 회귀 방지

- `lookupDictionary`는 외부 HTTP 없이 status=temporarily_unavailable·빈 뜻을 반환한다. Handler/main은 translator를 생성하거나 호출하지 않는다. 외부 HTTP trap을 건 red 테스트를 확인한 뒤 수정했고 Go 전체 패키지가 통과했다.
- 기존 source_url을 ON CONFLICT에서 바꾸지 않고 실제 persisted source_url을 RETURNING한다. 조회가 기존 뜻·메모·출처를 다시 작성하지 않는다. 임의 URL이나 새 sourceProvider/sourceCode DTO는 추가하지 않았다.
- 기기에 이미 있는 단어를 다시 보관할 때 새 lookup ACK로 최신 미전송 메모를 덮지 않는다. OFF에서는 기기에만 보관하고 서버/외부 호출을 하지 않는다.
- PDF의 실제 두 번째 페이지 글자 드래그·제어 영역 비중첩은 유지하며 이후 상태/직접 뜻 저장·기존 기록·재로드를 검증한다. 기존 공급자 다의어 assertion은 사용자 보류 계약으로 정직하게 변경하고 원래 다른 기능 검사는 유지한다. 새 권한/입력/메모 보존 케이스를 추가해 전체129개를 등록했다.

## 보류한 우리말샘 구현

미완성 변경은 `/tmp/flownote-opendict-deferred-20261029-224538`의 patch/파일/manifest/재개 메모에 보관했다. 실제 키 문자열이 포함되지 않았음을 검사한 뒤 본 작업의 tracked14/untracked5만 ec3 기준으로 복원했다. 공유 root/원본 .env는 수정하지 않았고 stage 키는 그대로 보존, production 새 키 등록/새 provider 호출은 하지 않는다. 별도 재개 승인이 오면 현재 운영 변경과 비교해 선택적으로 적용한다.

검증 명령/실제 배포와 앱 릴리스 결과는 이번 실행 보고서에 기록한다. 기존 자동 조회 테스트를 skip하거나 Reader를 통째로 삭제해 green으로 표시하지 않는다.
