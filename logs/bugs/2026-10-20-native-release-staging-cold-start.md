# Windows native release staging cold start

- 증상: Windows runner `39363975994`에서 설치형/portable 패키징은 성공했으나 최초 테스트 계정 생성 `POST /api/users`가 HTTP 502로 실패했다.
- 원인/근거: serverless cloud staging의 최초 인증 서비스 준비 지연으로 판단한다. 앱 실행 이전 API fixture 생성 단계였으며 native 앱 오류는 아니다. 응답만으로 내부 원인을 확정하지 않는다.
- 수정: 테스트 데이터를 쓰기 전에 비인증 GET `/api/users/me`, `/api/canvas/documents`가 401을 반환할 때까지 제한적으로 재확인한다. POST mutation을 무조건 재시도하지 않는다. production 테스트나 로컬 서버 fallback은 추가하지 않는다.
- 다음 조치: 같은 앱 소스와 준비 확인을 포함한 새 Windows runner에서 실제 NSIS/portable smoke를 다시 통과시킨다.
