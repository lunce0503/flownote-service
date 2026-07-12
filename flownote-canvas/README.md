# flownote-canvas (Go)

캔버스 기능 전담 백엔드. flownote-server(Spring)의 `/api/canvas/**` 책임을 Go로 재구현해
메인 서버의 부하를 분리한다. flownote-server와 **같은 PostgreSQL·S3 자원을 공유**하며,
`canvas_*` 테이블에 Spring과 호환되는 포맷으로 read/write 한다(교차 검증 완료).

## 엔드포인트

- `GET /` · `GET /health` — 헬스체크(인증 불필요)
- `GET /api/canvas/load` · `GET /api/canvas` — 캔버스 로드
- `POST /api/canvas/save` — 레거시 전체 저장
- `GET /api/canvas/metadata?canvasId=` — 메타데이터
- `GET /api/canvas/elements?canvasId=` — 요소 조회
- `POST /api/canvas/elements/save?canvasId=` — 요소 증분 저장(mutation 멱등성)
- `GET /api/canvas/viewport?canvasId=` · `PUT /api/canvas/{canvasId}/viewport` — 뷰포트
- `GET/POST /api/canvas/documents` · `PATCH/DELETE /api/canvas/documents/{canvasId}` — 문서 CRUD
- `GET/POST /api/canvas/folders` · `PATCH/DELETE /api/canvas/folders/{folderId}` — 폴더 CRUD
- `POST/DELETE /api/canvas/folders/{folderId}/documents/{canvasId}` — 폴더-문서 연결
- `POST /api/canvas/assets` — 이미지 업로드(멀티파트 `image`)
- `GET /api/canvas/assets/{assetId}` · `GET /api/canvas/assets/by-key?objectKey=` — 자산 조회(인증 불필요, Spring과 동일)

## 인증

`Authorization: Bearer <UUID>` — flownote-server와 공유하는 `app_sessions` 테이블을 조회해 사용자를 해석한다.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `PORT` | 리슨 포트(기본 8090) |
| `DATABASE_URL` | Postgres 연결 문자열. 없으면 `SPRING_DATASOURCE_URL/USERNAME/PASSWORD`로 조립 |
| `FLOWNOTE_STORAGE_ENDPOINT` / `_BUCKET` / `_REGION` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_PUBLIC_BASE_URL` | S3 호환 스토리지(Spring과 동일 변수). 미설정 시 자산 API는 503 |
| `CORS_ORIGINS` | 쉼표 구분 허용 오리진(게이트웨이 뒤면 비움) |

## Spring 대비 단순화(의도적)

- 요소 payload를 **인라인 저장**(`object_key=NULL`, `storage_status='READY'`)한다. Spring의 비동기 S3 아웃박스 오프로드는 생략하되, Spring이 오프로드해 둔 기존 데이터는 `object_key`로 S3에서 읽어 **읽기 호환**을 유지한다.
- Redis 요소 캐시는 생략(DB 직접 조회). 정확성에는 영향 없음.
- 캔버스 쓰기는 flownote-canvas 한 서비스로만 라우팅한다는 전제이므로 mutation 멱등 해시는 자체 방식을 쓴다.

## 로컬 실행

```bash
docker build -t flownote-canvas:dev .
docker run --rm --network service_default \
  -e DATABASE_URL=postgres://<user>:<pass>@db:5432/flownote \
  -e PORT=8090 -p 8090:8090 flownote-canvas:dev
```
