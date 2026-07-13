# 릴리즈 준비 체크리스트

- 영향받는 모든 빌드가 통과한다.
- DB migration은 순서가 맞고, 가능한 경우 되돌릴 수 있으며, 문서화되어 있다.
- 환경 변수는 비밀값 없이 문서화되어 있다.
- Docker Compose 영향도를 이해했다.
- 파일 수정 작업에 맞는 클라우드 배포 대상을 식별했다. Vercel production, Railway `flownote-api`, Railway `flownote-main` 중 영향받는 대상을 배포했다.
- `logs/report/` 전용 보고서 작업이면 Docker와 클라우드 배포를 생략했고 파일 검증 결과를 기록했다.
- `logs/report/` 외 문서 전용 변경이면 Vercel production 배포를 수행했고, 백엔드 배포가 필요 없는 이유를 기록했다.
- 사용자-facing 흐름을 수동 또는 자동으로 확인했다.
- 로그와 오류는 민감 정보를 노출하지 않으면서 유용하다.
- 알려진 잔여 리스크를 나열했다.
