# 캔버스 관리자 콘솔 운영 보고서

## 1. 목적

이 문서는 캔버스 저장·불러오기 장애를 관리자 화면에서 확인하고, 필요하면 Railway 로그로 원인을 좁히는 절차를 설명한다.

관리자 콘솔은 다음 두 종류의 정보를 제공한다.

- 서버 공통 진단: PostgreSQL 상태, 서버 요청 큐, R2 비동기 작업, 최근 30일 요청 기록
- 현재 기기 진단: 해당 iPad 또는 브라우저의 IndexedDB에 남은 저장·불러오기 오류

## 2. 접속 방법

1. `lunce` 계정으로 https://flownote-react.vercel.app 에 로그인한다.
2. 우측 상단 프로필 메뉴에서 `운영 진단`을 누른다.
3. 직접 접속할 때는 https://flownote-react.vercel.app/admin/canvas 를 연다.
4. 화면은 15초마다 자동 갱신된다. 우측 상단 새로고침 버튼으로 즉시 갱신할 수도 있다.

`lunce` 계정은 DB migration에서 `ADMIN` 역할로 설정된다. 기존 로그인 정보에 역할이 보이지 않으면 로그아웃 후 다시 로그인한다. 일반 사용자가 `/admin/canvas`에 접근하면 홈으로 이동하며, 관리자 API도 서버에서 다시 권한을 검사한다.

## 3. 상단 상태 지표

| 항목 | 정상 기준 | 이상 시 의미 |
| --- | --- | --- |
| PostgreSQL | `UP` | DB 연결 실패 또는 쿼리 실패 가능성 |
| 실행 중 | 보통 `0~4` | 동시에 처리 중인 캔버스 요청 수 |
| 대기 요청 | 평상시 `0` | 값이 계속 증가하면 DB/R2/서버 처리 지연 가능성 |
| R2 작업 | 일시적으로 증가 후 감소 | `PENDING`, `PROCESSING`, `FAILED` 작업의 총량 |

R2 작업 수는 누적 완료 건수를 포함할 수 있으므로 숫자 하나만으로 장애를 판단하면 안 된다. 정확한 상태 구분은 관리자 API 또는 DB의 `canvas_storage_jobs.status`별 집계를 확인한다.

## 4. 서버 요청 기록 확인

첫 번째 표는 최근 30일 동안 Spring 서버가 처리한 캔버스 요청을 보여준다. 최대 100건을 화면에 표시한다.

| 열 | 의미 |
| --- | --- |
| 시간 | 서버가 진단 이벤트를 기록한 시각 |
| 작업 | `SAVE` 또는 `LOAD` |
| 트리거 | `MANUAL`, `SELECTION`, `REMOTE`, `AUTOMATIC`, `RETRY` 등 |
| 우선도 | 서버가 계산한 우선순위. 숫자가 높을수록 먼저 처리 |
| 상태 | `SUCCEEDED` 또는 `FAILED` |
| 큐 | 실행되기 전 대기 시간 |
| 전체 | 실제 작업 처리 시간 |
| 오류 | 실패한 예외 코드. 정상은 `-` |

### 우선 확인할 패턴

- `queue_ms`만 높음: 요청이 몰렸거나 앞선 작업이 오래 실행 중이다.
- `total_ms`가 높음: PostgreSQL 쿼리, 데이터 직렬화 또는 서버 내부 처리가 느리다.
- `DATABASE_UNAVAILABLE`: DB 연결 장애다. 클라이언트는 IndexedDB에 동일한 `mutationId` 요청을 보관한다.
- `CANVAS_QUEUE_FULL`: 전역 또는 사용자별 큐 제한에 도달했다. 짧은 재시도보다 원인 작업의 지연을 먼저 확인한다.
- `FAILED`가 반복됨: 동일 canvas와 시간대의 Railway Spring 로그를 확인한다.

## 5. 현재 기기의 오류 확인

`이 기기의 최근 오류` 표는 현재 브라우저의 IndexedDB에 저장된 최대 100건의 오류다. 서버 전체 로그가 아니라 해당 iPad 또는 브라우저에서 발생한 오류만 표시한다.

확인 가능한 정보:

- 발생 시간
- `LOAD` 또는 `SAVE`
- canvas ID
- 클라이언트가 받은 오류 메시지

iPad에서 오류가 발생하면 같은 iPad에서 관리자 계정으로 로그인하고 `/admin/canvas`를 열어야 해당 로컬 오류를 볼 수 있다. 다른 PC에서 접속하면 iPad의 IndexedDB 기록은 보이지 않는다.

## 6. 권장 장애 분석 순서

1. 현재 기기 오류에서 `LOAD`인지 `SAVE`인지와 발생 시간을 확인한다.
2. 서버 요청 기록에서 같은 시간대와 작업 종류를 찾는다.
3. PostgreSQL이 `UP`인지 확인한다.
4. 요청의 `queue_ms`와 `total_ms` 중 어느 쪽이 높은지 비교한다.
5. R2 작업이 계속 증가하는지 확인한다.
6. 서버 기록이 없으면 FastAPI 소켓 연결 또는 클라이언트 네트워크 문제를 확인한다.
7. 서버 기록이 `FAILED`이면 Railway `flownote-main` 로그를 확인한다.
8. 소켓 disconnect, timeout, gateway 오류이면 Railway `flownote-api` 로그도 확인한다.

## 7. 관리자 API

관리자 화면은 다음 Spring API를 호출한다.

```text
GET  /api/admin/canvas/summary
GET  /api/admin/canvas/events?limit=100
POST /api/admin/canvas/storage-jobs/{jobId}/retry
POST /api/admin/canvas/storage-probe
```

- `summary`: PostgreSQL, 서버 요청 큐, R2 outbox 작업 집계
- `events`: 최근 30일의 익명화된 요청 기록
- `storage-jobs/{jobId}/retry`: `FAILED` R2 작업을 다시 `PENDING`으로 변경
- `storage-probe`: R2에 임시 객체를 쓰고 읽고 삭제해 실제 연결을 점검

이 API는 모두 유효한 `ADMIN` 세션 토큰이 필요하다. 토큰은 보고서나 채팅에 기록하지 않는다.

## 8. Railway 로그 확인

Spring 저장, PostgreSQL, R2 worker 오류:

```bash
railway logs \
  --service b17cacad-aca6-4211-90ac-8cf14d6ffdd8 \
  --environment ae55fc37-9251-48d1-bdbe-87a2ea3462fa \
  --lines 200 --json
```

FastAPI Socket.IO, gateway timeout, disconnect 오류:

```bash
railway logs \
  --service 80944a75-c766-4e71-9d9a-11d3257d6083 \
  --environment ae55fc37-9251-48d1-bdbe-87a2ea3462fa \
  --lines 200 --json
```

운영 헬스체크:

```bash
curl -fsS https://flownote-production.up.railway.app/actuator/health
curl -fsS https://flownote-api-production.up.railway.app/
```

## 9. 현재 제한 사항

- 관리자 화면은 R2 작업을 상태별로 상세 표시하지 않고 총량만 표시한다.
- 실패한 R2 job ID 목록과 재시도 버튼은 API에만 있고 화면에는 아직 연결되지 않았다.
- 현재 기기 오류는 IndexedDB 기반이라 브라우저 데이터 삭제 시 사라진다.
- 서버 이벤트에는 원본 선, 텍스트, 이미지 payload를 저장하지 않는다.
- FastAPI까지 도달하지 못한 완전한 오프라인 요청은 서버 요청 기록에 나타나지 않는다.

## 10. 구현 및 배포 결과

- PostgreSQL `canvas_elements.payload`를 권위 원본으로 사용한다.
- R2 저장은 `canvas_storage_jobs` outbox worker가 비동기로 처리한다.
- DB 장애 시 요청은 동일한 `mutationId`로 IndexedDB에 보관되고 지수 백오프로 재시도된다.
- Vercel production: `dpl_CzrkG7FfFLqfuPCxXEqyyC9au3Gg`
- Railway `flownote-api`: `4922725e-4990-45cc-9095-9f0fad26e6ef`, `SUCCESS`
- Railway `flownote-main`: `5b82f898-6f09-4989-aa1c-31fa90515566`, `SUCCESS`
- 운영 Spring health: `UP`
- 운영 FastAPI health: HTTP `200`

이 작업은 보고서만 수정했으므로 Docker 빌드와 클라우드 재배포를 진행하지 않았다.
