# Canvas line interpolation

## 변경 목적

저장된 선을 다시 렌더링하거나 확대했을 때 점 사이가 각진 폴리라인으로 보이는 현상을 완화한다.

## 구현

- 저장 데이터와 서버 payload의 원본 좌표는 변경하지 않는다.
- 정적 선과 작성 중인 선의 렌더 좌표에 끝점을 보존하는 Chaikin 보간을 한 번 적용한다.
- Konva `tension`은 사용하지 않아 끝점 오버슈트와 짧은 획 되말림을 방지한다.
- 정적 선의 보간 결과는 원본 좌표 배열을 키로 캐시한다.
- 비정상적으로 긴 선은 렌더 좌표를 최대 12,000개로 제한한다.
- 공간 인덱스, 지우개 판정, 선택 및 저장은 원본 좌표를 계속 사용한다.
- staging Serverless 콜드 스타트의 일시적인 502가 정상 릴리스를 중단하지 않도록 배포 스모크 체크에 제한 재시도를 추가했다.

## 검증

- 보간 수치 검증: 시작·끝점 보존, 원본 경계 내 유지, 입력 불변, 최대 점 수 제한 통과
- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn build`: 통과
- `node --test scripts/cloud-resource-policy.test.mjs`: 5개 통과
- staging 클라우드 E2E: 11개 통과

## 배포 상태

- 스테이징 Vercel: `dpl_24TLqEA64WsmLUjSFUec3kD6CXXC` (`READY`)
- 프로덕션 Vercel: `dpl_DhNb9xKLyjMWyrY5RaUWquNHUA7G` (`READY`)
- 운영 웹 `https://flownote-react.vercel.app/`: HTTP 200
- 운영 Gateway `/`: HTTP 200
- 운영 Gateway `/api/users/me`: 비인증 기준 HTTP 401
