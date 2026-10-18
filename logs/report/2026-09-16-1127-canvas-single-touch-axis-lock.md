# Canvas 한 손가락 축 고정 이동

## 변경

- 펜슬 전용 그리기가 켜진 상태에서 한 손가락 터치를 캔버스 이동으로 처리한다.
- 이동 시작 6px 이후 주 방향을 판별해 가로 제스처는 X축, 세로 제스처는 Y축으로 고정한다.
- 두 번째 손가락이 닿으면 한 손가락 축 고정을 종료하고 기존 자유 이동·핀치 확대 제스처로 전환한다.
- 클라우드 E2E에 가로·세로 축 고정 회귀 검증을 추가했다.

## 검증

- `cd flownote && yarn typecheck`: 통과
- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn build`: 통과
- `cd flownote && yarn e2e --list`: 9개 테스트 등록 확인

## 배포

- staging 배포 전 Railway CLI 사전 점검에서 중단됐다.
- 실패 명령: `railway whoami --json`, `railway status --json`
- 원인: 실행 환경에서 `backboard.railway.com` DNS 조회가 차단됐다.
- staging과 production 배포 및 클라우드 E2E는 실행하지 못했다.
- 네트워크가 허용된 환경에서 `node scripts/deploy-cloud.mjs release web`을 실행해야 한다.

### 재시도

- `XDG_CACHE_HOME=/tmp/vercel-cache`로 읽기 전용 Vercel 캐시 경로를 우회했다.
- `node scripts/deploy-cloud.mjs release web`을 실행했으나 Railway 프로젝트 컨텍스트 검증에서 동일한 DNS 오류로 종료됐다.
- Vercel staging 배포가 시작되기 전 실패했으며 deployment ID는 생성되지 않았다.
