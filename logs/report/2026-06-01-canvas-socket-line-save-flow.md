# 캔버스 소켓 기반 선 데이터 저장 흐름

작성일: 2026-06-01

## 요약

그림판 저장 흐름은 React 클라이언트와 FastAPI 서비스 사이에서 Socket.IO를 사용한다. FastAPI 서비스는 캔버스 요소를 직접 DB에 저장하지 않고, 불러오기와 저장 요청을 Spring Boot 메인 API로 전달한다. 실제 선, 이미지, 텍스트 박스 요소의 영속화는 Spring 서버가 담당한다.

로컬 Docker 기준 서버 주소와 포트는 다음과 같다.

| 역할 | 서비스 | 브라우저 접근 주소 | 컨테이너 내부 주소 | 포트 |
|---|---|---|---|---|
| React Vite 앱 | `flownote-react` | `http://localhost:5173` | `react-app:5173` | `5173` |
| FastAPI 소켓/API | `flownote-api` | `http://localhost:8000` | `api-server:8000` | `8000` |
| Spring 메인 API | `flownote-spring` | `http://localhost:8080` | `spring-server:8080` | `8080` |
| PostgreSQL | `flownote-db` | `localhost:5432` | `db:5432` | `5432` |
| Redis | `flownote-redis` | `localhost:6379` | `redis:6379` | `6379` |

운영 환경 주소는 다음과 같다.

| 역할 | URL |
|---|---|
| React 앱 | `https://flownote-react.vercel.app` |
| FastAPI 소켓/API | `https://flownote-api-production.up.railway.app/socket.io` |

운영 환경에서는 외부 소켓 주소가 HTTPS 기본 포트인 `443`을 사용한다. Railway는 외부 요청을 FastAPI 컨테이너의 실행 포트로 전달한다.

## 선 데이터 구조

프론트엔드 선 타입은 `flownote/src/entities/canvas/model/types.ts`에 정의되어 있다.

```ts
type LineElement = {
  id: string;
  points: { x: number; y: number }[];
  color?: string;
  strokeWidth?: number;
  status?: "new" | "modified" | "deleted" | "unchanged";
};
```

사용자가 선을 하나 그리면 클라이언트 메모리에는 대략 다음 형태로 저장된다.

```json
{
  "id": "line-001",
  "points": [
    { "x": 120.2, "y": 240.1 },
    { "x": 125.8, "y": 244.4 },
    { "x": 133.3, "y": 251.9 }
  ],
  "color": "#000000",
  "strokeWidth": 3,
  "status": "new"
}
```

`status` 필드는 클라이언트가 저장 대상을 구분하기 위해서만 사용한다. 서버로 전송할 때는 제거된다.

## 초기 소켓 방 참여

캔버스를 열면 클라이언트는 다음 소켓 서버로 연결한다.

```txt
http://localhost:8000/socket.io
```

관련 프론트엔드 함수:

- `getCanvasSocket()` in `flownote/src/features/canvas/model/usePersistence.tsx`
- `emitCanvasSocket()` in `flownote/src/features/canvas/model/usePersistence.tsx`

이후 클라이언트는 현재 캔버스 방에 들어가기 위해 다음 이벤트를 보낸다.

```txt
event: canvas:join
payload: { authorization, canvasId }
```

관련 FastAPI 함수:

- `canvas_join()` in `flownote-API/app/canvas_socket.py`

FastAPI 서버는 Spring 서버로 메타데이터 요청을 전달해 접근 권한을 확인한다.

```txt
GET http://spring-server:8080/api/canvas/metadata?canvasId={canvasId}
```

권한 확인 후 Socket.IO 세션은 다음 방에 들어간다.

```txt
room = canvas:{canvasId}
```

## 새 선 저장

### 1. 클라이언트가 저장 Payload 생성

저장은 다음 프론트엔드 함수 흐름에서 시작한다.

- `requestSave()` in `usePersistence.tsx`
- `handleSave()` in `usePersistence.tsx`
- `buildCanvasSavePayload()` in `usePersistence.tsx`

`requestSave()`는 저장 요청을 바로 실행하지 않고 `1500ms` 동안 debounce한다. 이후 `handleSave()`가 현재 캔버스 상태를 기준으로 저장 payload를 만든다.

새 선은 `status`가 `"new"`이므로 `buildCanvasSavePayload()`에서 `addedLines`에 들어간다.

```ts
addedLines: drawnLines
  .filter((line) => line.status === "new")
  .map(serializeLine)
```

`serializeLine()`은 `status`를 제거하고, 선의 점 좌표를 단순화 및 반올림한다.

서버로 나가는 payload 예시는 다음과 같다.

```json
{
  "addedLines": [
    {
      "id": "line-001",
      "points": [
        { "x": 120.2, "y": 240.1 },
        { "x": 125.8, "y": 244.4 },
        { "x": 133.3, "y": 251.9 }
      ],
      "color": "#000000",
      "strokeWidth": 3
    }
  ],
  "modifiedLines": [],
  "deletedLines": [],
  "addedImages": [],
  "modifiedImages": [],
  "deletedImages": [],
  "addedTextBoxes": [],
  "modifiedTextBoxes": [],
  "deletedTextBoxes": []
}
```

### 2. 클라이언트가 `canvas:save` 전송

관련 프론트엔드 함수:

- `saveCanvasPayload()` in `usePersistence.tsx`

소켓 이벤트는 다음 경로로 전송된다.

```txt
Client A -> FastAPI 8000
event: canvas:save
```

소켓 payload 예시는 다음과 같다.

```json
{
  "authorization": "Bearer ...",
  "canvasId": "canvas-uuid",
  "payload": {
    "addedLines": [
      {
        "id": "line-001",
        "points": [
          { "x": 120.2, "y": 240.1 },
          { "x": 125.8, "y": 244.4 },
          { "x": 133.3, "y": 251.9 }
        ],
        "color": "#000000",
        "strokeWidth": 3
      }
    ]
  }
}
```

### 3. FastAPI가 Spring으로 저장 요청 전달

관련 FastAPI 함수:

- `canvas_save()` in `flownote-API/app/canvas_socket.py`
- `_forward_json()` in `flownote-API/app/canvas_socket.py`

FastAPI는 저장 요청을 Spring 서버로 전달한다.

```txt
POST http://spring-server:8080/api/canvas/elements/save?canvasId=canvas-uuid
```

즉 FastAPI는 소켓 통신의 진입점 역할을 하고, 실제 저장은 Spring 서버에 위임한다.

### 4. Spring Controller가 저장 요청 수신

관련 Spring Controller:

- `CanvasController.saveElementsByQuery()` in `flownote-server/src/main/java/com/flownote/canvas/CanvasController.java`

엔드포인트:

```txt
POST /api/canvas/elements/save?canvasId={canvasId}
```

Controller는 Authorization 헤더에서 사용자 ID를 얻은 뒤 다음 Service 함수를 호출한다.

```java
canvasService.saveElements(userId, canvasId, request)
```

요청 DTO는 다음 파일에 있다.

- `CanvasDtos.CanvasSaveRequest` in `flownote-server/src/main/java/com/flownote/canvas/CanvasDtos.java`

각 요소 그룹은 `JsonNode`로 받는다.

```java
public record CanvasSaveRequest(
    JsonNode addedLines,
    JsonNode modifiedLines,
    JsonNode deletedLines,
    JsonNode addedImages,
    JsonNode modifiedImages,
    JsonNode deletedImages,
    JsonNode addedTextBoxes,
    JsonNode modifiedTextBoxes,
    JsonNode deletedTextBoxes
) {}
```

### 5. Spring Service가 선을 영속화

관련 Spring Service 함수:

- `CanvasService.saveElements()`
- `CanvasService.lockCanvasSave()`
- `CanvasService.invalidateElementSnapshot()`
- `CanvasService.upsertElements()`
- `CanvasService.upsertElement()`

저장 순서는 다음과 같다.

```txt
requireOwnedCanvas(userId, canvasId)
lockCanvasSave(userId, canvasId)
invalidateElementSnapshot(userId, canvasId)
deleteElements(... deletedLines)
upsertElements(... addedLines)
upsertElements(... modifiedLines)
UPDATE canvas_documents SET revision = revision + 1
```

`lockCanvasSave()`는 PostgreSQL advisory transaction lock을 사용한다.

```sql
SELECT pg_advisory_xact_lock(hashtext(userId), hashtext(canvasId))
```

이 락으로 같은 사용자와 같은 캔버스에 대한 동시 저장은 트랜잭션 단위로 순서가 보장된다.

새 선은 `upsertElement()`에서 전체 JSON이 object storage에 저장된다.

```txt
canvas-elements/{canvasId}/line/{lineId}.json
```

예시 object key:

```txt
canvas-elements/canvas-uuid/line/line-001.json
```

저장되는 선 JSON:

```json
{
  "id": "line-001",
  "points": [
    { "x": 120.2, "y": 240.1 },
    { "x": 125.8, "y": 244.4 },
    { "x": 133.3, "y": 251.9 }
  ],
  "color": "#000000",
  "strokeWidth": 3
}
```

`canvas_elements` 테이블에는 원본 전체 대신 메타데이터와 조회용 필드가 저장된다.

```txt
id = line-001
canvas_id = canvas-uuid
user_id = user-uuid
type = line
payload = { id, objectKey, url }
object_key = canvas-elements/canvas-uuid/line/line-001.json
byte_size = ...
public_url = ...
bbox_min_x = 120.2
bbox_min_y = 240.1
bbox_max_x = 133.3
bbox_max_y = 251.9
revision = ...
```

`bbox_*` 값은 선의 점 좌표에서 계산한 경계 상자다. 이후 검색이나 부분 로딩 최적화에 사용할 수 있다.

## 저장 성공과 실시간 알림

Spring 저장이 성공하면 FastAPI는 같은 캔버스 방에 실시간 변경 이벤트를 보낸다.

```txt
event: canvas:changed
room: canvas:{canvasId}
payload: { canvasId, sourceSid }
```

관련 FastAPI 함수:

- `canvas_save()` in `flownote-API/app/canvas_socket.py`

저장을 요청한 클라이언트는 `skip_sid`로 제외된다. 따라서 같은 캔버스를 열고 있는 다른 클라이언트만 `canvas:changed`를 받는다.

저장한 Client A에서는 `handleSave()`가 다음 함수를 호출한다.

- `commitSavedCanvasState()` in `usePersistence.tsx`

이때 로컬 요소 상태는 다음처럼 바뀐다.

```json
{ "status": "new" }
```

에서:

```json
{ "status": "unchanged" }
```

로 변경된다.

## 같은 선 수정

Client A가 방금 저장한 같은 선을 다시 수정하면 클라이언트 상태는 다음 형태가 된다.

```json
{
  "id": "line-001",
  "points": [
    { "x": 130.0, "y": 250.0 },
    { "x": 138.0, "y": 258.0 },
    { "x": 144.0, "y": 263.0 }
  ],
  "color": "#fbbf24",
  "strokeWidth": 3,
  "status": "modified"
}
```

다음 저장 payload에서는 이 선이 `modifiedLines`에 들어간다.

```json
{
  "addedLines": [],
  "modifiedLines": [
    {
      "id": "line-001",
      "points": [
        { "x": 130.0, "y": 250.0 },
        { "x": 138.0, "y": 258.0 },
        { "x": 144.0, "y": 263.0 }
      ],
      "color": "#fbbf24",
      "strokeWidth": 3
    }
  ],
  "deletedLines": []
}
```

수정 저장도 같은 서버 흐름을 탄다.

```txt
Client A
requestSave()
-> handleSave()
-> buildCanvasSavePayload()
-> saveCanvasPayload()
-> socket emit canvas:save

FastAPI 8000
canvas_save()
-> _forward_json("POST", "/api/canvas/elements/save")

Spring 8080
CanvasController.saveElementsByQuery()
-> CanvasService.saveElements()
-> upsertElements()
-> upsertElement()
```

`upsertElement()`는 `ON CONFLICT (canvas_id, id) DO UPDATE`를 사용한다. 따라서 같은 `canvasId`와 `line-001` 조합이 이미 있으면 새 row를 만들지 않고 기존 row를 갱신한다.

object storage의 JSON도 같은 key에 다시 저장된다.

```txt
canvas-elements/canvas-uuid/line/line-001.json
```

수정 후 저장되는 JSON 예시는 다음과 같다.

```json
{
  "id": "line-001",
  "points": [
    { "x": 130.0, "y": 250.0 },
    { "x": 138.0, "y": 258.0 },
    { "x": 144.0, "y": 263.0 }
  ],
  "color": "#fbbf24",
  "strokeWidth": 3
}
```

이때 DB row의 bounding box, byte size, public URL, revision, `updated_at`도 함께 갱신된다.

## 다른 클라이언트가 변경을 받는 과정

같은 캔버스를 열고 있는 다른 클라이언트는 이미 다음 방에 들어가 있다.

```txt
canvas:{canvasId}
```

Client A의 저장이 성공하면 FastAPI가 `canvas:changed`를 보낸다.

관련 프론트엔드 listener:

- `socket.on("canvas:changed", handleRemoteCanvasChanged)` in `usePersistence.tsx`

변경을 받은 클라이언트에 로컬 미저장 변경이 없으면 다음 함수를 호출한다.

```txt
handleLoad()
```

이후 다음 흐름으로 최신 데이터를 다시 불러온다.

```txt
Client B -> FastAPI 8000
event: canvas:load

FastAPI 8000 -> Spring 8080
GET /api/canvas/metadata?canvasId=...
GET /api/canvas/elements?canvasId=...
```

관련 Spring 불러오기 함수:

- `CanvasService.elements()`
- `CanvasService.readElementArrays()`
- `CanvasService.buildElementArrays()`
- `CanvasService.readElementPayload()`

`CanvasService.elements()`는 먼저 Redis 캐시를 확인한다. 캐시가 없으면 `canvas_elements` 테이블을 읽고, 각 row의 `object_key`를 사용해 object storage에서 전체 JSON payload를 읽는다.

최종 불러오기 응답 예시는 다음과 같다.

```json
{
  "lines": [
    {
      "id": "line-001",
      "points": [
        { "x": 130.0, "y": 250.0 },
        { "x": 138.0, "y": 258.0 },
        { "x": 144.0, "y": 263.0 }
      ],
      "color": "#fbbf24",
      "strokeWidth": 3
    }
  ],
  "images": [],
  "textBoxes": []
}
```

프론트엔드는 `applyServerCanvasStatus()`로 서버 데이터를 적용하면서 불러온 요소의 상태를 다음처럼 표시한다.

```json
{ "status": "unchanged" }
```

## 동시 저장 처리

클라이언트는 다음 ref로 중복 저장을 제어한다.

- `saveInFlightRef`
- `saveAgainRequestedRef`

이미 저장 중이면 다음 저장을 즉시 시작하지 않는다. 대신 `saveAgainRequestedRef`를 true로 설정하고, 현재 저장이 끝난 뒤 최신 캔버스 상태를 다시 저장한다.

원격 변경을 받는 것도 로컬 변경이 있을 때는 지연된다.

- `remoteReloadRequestedRef`

`canvas:changed`가 도착했는데 클라이언트가 저장 중이거나 미저장 변경을 가지고 있으면, 바로 서버 데이터로 덮어쓰지 않는다. 로컬 저장이 끝난 뒤 `handleLoad()`를 호출해 최신 서버 상태를 다시 가져온다.

## 전체 함수 체인

```txt
Client
requestSave()
-> handleSave()
-> buildCanvasSavePayload()
-> saveCanvasPayload()
-> socket emit "canvas:save"

FastAPI 8000
canvas_save()
-> _forward_json("POST", "/api/canvas/elements/save")

Spring 8080
CanvasController.saveElementsByQuery()
-> CanvasService.saveElements()
-> lockCanvasSave()
-> invalidateElementSnapshot()
-> upsertElements()
-> upsertElement()
-> canvas_elements DB row upsert
-> object storage line JSON write
-> canvas_documents.revision increment

FastAPI 8000
canvas_save()
-> emit "canvas:changed" to room canvas:{canvasId}

Other Client
socket.on("canvas:changed")
-> handleLoad()
-> socket emit "canvas:load"
-> CanvasService.elements()
-> screen update
```
