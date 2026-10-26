# 책 읽기·한국어 사전 배포 후보 인계

상태: 코드 및 정적/단위 검증 완료, staging/production·앱 반영 미완료. 이전 f90a1b9 운영 배포는 이번 개선의 완료 증거가 아니다.

사용자의 요구는 휠·Space/Shift+Space·손가락으로 넘기기, 숨김 UI 정리, 두 쪽 보기 설정, 한국어 번역과 여러 뜻 동시 표시다. [실행 계획](../../docs/exec-plan/active/2026-10-27-library-reader-korean.md)과 [기능 계약](../../docs/product-specs/textbook-library.md)을 따른다.

- 격리 소스 /tmp/flownote-library-reader-korean-20261027, branch codex/library-reader-korean-20261027. 기준 운영 f90a1b9. 이번 scope만 공유 트리에서 복사했다.
- 프런트 yarn verify 통과, 모델85/85·skip0, Go 전체 패키지 통과. 로그 /tmp/flownote-reader-web-final.log, /tmp/flownote-reader-models-final.log, /tmp/flownote-reader-go-final.log.
- Go 실제 번역 live audit 통과: 공식 gemini-3.1-flash-lite에 공개 합성 사전 뜻2개를 요청해 각각 한국어를 검증했다. /tmp/flownote-reader-translation-live.log. 비밀값/사용자 PDF/선택어 기록은 남기지 않았다.
- 임시 live audit bind mount가 만든 빈 Go 테스트 mountpoint 때문에 후속 gofmt가 EOF로 실패한 것을 제거하고 전체 Go 검사를 다시 통과했다. 최초 모델/Go 타입 검사는 미구현 상태에서 red를 확인했고, 상태 갱신 lint도 DOM 외부 시스템 동기화 방식으로 수정해 최종 verify가 통과했다.
- Playwright116개/25파일 등록, 실행 통과는 아직 아니다. 신규9개는 Chromium390/1440 및 WebKit820에서 wheel/Space/두 쪽·홀수끝·선호/재로드, 실제 오른쪽 페이지 글자 drag·한국어 다의어/페이지2 기록, 손가락/다중접촉·확대 가드를 검증한다. WebKit 손가락 스트림은 DOM event smoke이며 Chromium CDP 터치·물리 iPad와 구분한다.
- schema/gateway/네이티브 실행 변경이 없어 target blog(canvas/web)로 staging-first 배포한다. main/API/AI/별도 Remote는 재배포하지 않는다. existing application manage에서 설치 앱·업데이트 경로·같은 소스 production을 완료한다.
- staging canvas의 FLOWNOTE_DICTIONARY_TRANSLATION_KEY를 유효한 기존 로컬 자격 증명으로 stdin 주입하고 model gemini-3.1-flash-lite를 설정·read-back했다. trigger deploy는 하지 않았다. cloud AI의 기존 키는 유효하지 않으므로 그 값을 복사하지 않는다. production은 staging 통과 후 /tmp/flownote-configure-reader-translation.py production으로 전용 key/model만 주입한다. 이 임시 운영 도구는 비밀값을 출력·저장하거나 CLI 인자에 넣지 않는다.
- 타 사용자/공유 루트 변경은 보존한다. 테스트용 staging 자료만 사용하고 production은 read-only smoke로 확인한다. 완료 후 실제 배포ID·지문·116개 gate·앱 검증과 물리 기기 한계를 기록한다.
