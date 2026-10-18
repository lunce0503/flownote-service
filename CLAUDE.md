# Flownote 작업 진입점

공통 작업 규칙은 [AGENTS.md](AGENTS.md), 문서 지도는 [docs/README.md](docs/README.md)를 따른다.

- LAN/loopback API 및 로컬 Compose 실행은 폐기했다. 클라이언트는 공개 클라우드 HTTPS만 사용한다.
- 환경 기준은 `scripts/cloud-environments.json`, 배포 규칙은 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)이다.
- 스테이징 배포와 실제 기능 검증이 먼저이며 같은 소스만 프로덕션으로 배포한다.
- Railway 서비스·DB·Redis 간 private networking은 PC 내부망과 구분하며 유지한다.
- 비밀값을 노출하지 않고 사용자 변경과 기존 데이터를 보존한다. 코드 변경 시 소유 문서와 검증 결과를 함께 갱신한다.
- 보고서만 수정하면 배포하지 않는다. 결과는 `logs/report/YYYY-MM-DD-HHMM-kebab-case.md`에 남긴다.
