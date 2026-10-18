# 피드백 배포 컨트롤러 런타임 확인

- 증상: 새 배포 경로를 systemd에서 처음 실행한 2건이 snapshot 단계에서 `spawnSync rg ENOENT`로 중단됐다. 앱 소스 수정이나 배포는 없었다.
- 원인: 대화형 shell에는 rg가 있지만 systemd의 고정 PATH에는 없다. snapshot 생성이 불필요하게 host rg에 의존했다.
- 수정: Node filesystem 순회로 skill instruction 파일을 수집하도록 변경했다. `/usr/bin:/bin` PATH만 사용하는 회귀 테스트를 추가했다.
- 추가 확인: Codex binary 디렉터리의 `/usr/local/bin` mount가 이미지의 같은 위치에 넣은 Node를 가린다. Node를 `/usr/bin/node`에 배치하고 이미지를 다시 빌드했다.
- 검증: 정책·snapshot 테스트 24개 통과, 컨테이너 `/usr/bin/node --version` 성공. 기존 자동화 Bash 테스트 13개 통과.
- 복구: 초기 환경 문제 2건의 로그·reason은 로컬 `retry-history/20261014-control-path/`에 보존했고 수동으로 재큐잉했다. 현재 worker 종료 후 한 번만 재처리하는 임시 systemd unit을 시작했다. 무한 재시도 정책은 추가하지 않았다.
- 별도 제품 판단/회귀 기준 충돌로 중단된 피드백은 환경 오류와 구분해 실패 큐와 모델 결과를 유지한다. 성공이나 운영 반영으로 기록하지 않는다.

원본 피드백·연락처·인증값은 기록하지 않는다.
