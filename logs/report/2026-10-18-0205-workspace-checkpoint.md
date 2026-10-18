# 작업 트리 변경 커밋·푸시 준비

## 범위

사용자 요청에 따라 기존 미커밋 변경 전체를 main에 보존하고 origin/main으로 푸시한다. 이번 작업에서 제품 구현은 추가로 변경하지 않았다.

- 클라우드 전용 실행 및 staging-first 배포 스크립트, 환경별 리소스 정책.
- 캔버스 저장·동기화·입력·렌더링, PDF·클립보드, 플래너 연계와 프로필 변경.
- Flownote Android WebView 앱과 기존 공개 APK 배포 자산.
- 피드백 자동화, 노트·작업 에이전트 연구 모듈, 개발 작업 공간 편입 계획.
- 관련 테스트, 제품·운영 문서, 버그·배포 보고서 및 기존 폐기 파일 삭제.

## 검증

- git fetch origin 성공. 검증 시작 시 HEAD와 origin/main의 앞섬/뒤처짐은 각각 0이었다.
- 변경·추가 파일의 비밀키·토큰·인증 URL 패턴 점검: 발견 0건. 인증 파일과 빌드 디렉터리는 기존 ignore를 유지한다.
- 추가 파일 151개, 총 794,549 bytes. 최대 파일은 Gradle wrapper JAR 59,203 bytes이며 공개 APK는 35,380 bytes다.
- git diff --check 및 git diff --cached --check: 통과. 새 연구 파일 4개의 EOF 빈 줄만 정리했다.
- cd flownote && yarn verify: lint·타입 검사·production 빌드 통과. pdfjs-dist 의존성의 eval 경고는 남아 있다.
- cd flownote-API && uv run pytest -q: 25개 통과.
- cd flownote-ai && uv run pytest -q: 4개 통과.
- node --test scripts/cloud-resource-policy.test.mjs automation/codex/tests/feedback-release.test.mjs flownote/src/features/planner/model/canvasPlannerSuggestions.test.mjs flownote-mobile/scripts/start-expo-go.test.mjs: 44개 통과.
- bash automation/codex/tests/run-tests.sh: 13개 통과.
- cd flownote-server && ./gradlew test --tests com.flownote.user.UserProfileTest --tests com.flownote.mobile.MobileConfigControllerTest: 통과. Gradle deprecation 경고가 남아 있다.
- node scripts/check-cloud-config.mjs: staging/production 분리와 로컬 API 목적지 거부 검증 통과.
- Go·연구 모듈·모바일 전체 검증, Android APK 재빌드와 실제 클라우드 E2E는 이번 커밋 준비에서 재실행하지 않았다. 기존 릴리스 검증은 각 보고서를 참고한다.

## 배포 경계

이번 요청은 기존 변경의 커밋·푸시이며 새로운 앱 수정이나 재배포 요청이 아니다. Docker 빌드와 클라우드 재배포는 수행하지 않았다. 별도 릴리스가 필요하면 node scripts/deploy-cloud.mjs release all로 staging 배포·E2E 후 동일 소스를 production에 배포한다.

GitHub main push는 Quality Gates를 실행한다. 이 보고서는 원격 CI 완료 또는 신규 운영 배포 성공을 주장하지 않는다. 푸시 결과와 원격 commit 일치는 최종 응답에서 확인한다.
