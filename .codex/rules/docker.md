# 클라우드 컨테이너 규칙

- Dockerfile은 Railway 빌드에 사용한다. 로컬 Compose 실행과 LAN 주소 fallback은 폐기됐다.
- 환경/서비스 경계는 `scripts/cloud-environments.json`과 Railway 실제 설정으로 확인한다.
- 클라이언트는 공개 HTTPS gateway, 백엔드 간 통신은 Railway private DNS를 사용한다.
- 이미지에 비밀값을 넣지 않는다. DB/볼륨을 초기화하거나 삭제하지 않는다.
- 스테이징 배포와 cloud E2E를 먼저 통과한 같은 소스만 production으로 배포한다.
- 상세 명령과 실패/롤백 절차는 `docs/DEPLOYMENT.md`를 따른다.
