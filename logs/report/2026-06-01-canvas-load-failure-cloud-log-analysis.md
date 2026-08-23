# 캔버스 불러오기 실패 클라우드 로그 분석

작성일: 2026-06-01

## 목적

그림판에서 간헐적으로 `불러오기 실패`가 발생하는 원인을 Vercel CLI와 Railway CLI로 확인한 운영 로그를 기준으로 분석한다.

## 조사 범위

사용한 CLI와 주요 명령:

```bash
vercel logs --environment production --since 6h --limit 200 --json
vercel logs --help
vercel whoami

RAILWAY_CALLER="skill:use-railway@1.2.1" \
RAILWAY_AGENT_SESSION="railway-skill-20260601-load-failure-report" \
railway status --json

RAILWAY_CALLER="skill:use-railway@1.2.1" \
RAILWAY_AGENT_SESSION="railway-skill-20260601-load-failure-report" \
railway logs --service flownote-api --environment production --lines 300 --json

RAILWAY_CALLER="skill:use-railway@1.2.1" \
RAILWAY_AGENT_SESSION="railway-skill-20260601-load-failure-report" \
railway logs --service flownote-main --environment production --lines 300 --json

RAILWAY_CALLER="skill:use-railway@1.2.1" \
RAILWAY_AGENT_SESSION="railway-skill-20260601-load-failure-report" \
railway logs --service flownote-main --environment production --http --since 24h --lines 200 --json --filter '@totalDuration:>=1000'

RAILWAY_CALLER="skill:use-railway@1.2.1" \
RAILWAY_AGENT_SESSION="railway-skill-20260601-load-failure-report" \
railway logs --service flownote-api --environment production --http --since 24h --lines 200 --json --filter '@totalDuration:>=1000'
```

## 현재 배포 상태

Railway `flownote-api`:

- 최신 deployment: `99c66726-785c-438a-9a6f-481f8f595997`
- 상태: `SUCCESS`
- 인스턴스 상태: `RUNNING`
- 도메인: `https://flownote-api-production.up.railway.app`

Railway `flownote-main`:

- 최신 확인된 production deployment: `2647e35e-88aa-4f89-baad-4a719e32963d`
- 상태: `SUCCESS`
- 인스턴스 상태: `RUNNING`
- 도메인: `https://flownote-production.up.railway.app`

Vercel `flownote-react`:

- production alias: `https://flownote-react.vercel.app`
- Vercel은 현재 React SPA 정적 서빙 구조라 서버 함수 로그가 거의 없다. `vercel logs --environment production --since 6h --limit 200 --json`는 프로젝트 조회와 로그 fetching만 수행했고, 의미 있는 서버 런타임 로그는 나오지 않았다.

헬스체크:

```txt
GET https://flownote-api-production.up.railway.app/
-> HTTP 200, {"message":"Hello, World!"}, time_total=0.363774

GET https://flownote-production.up.railway.app/actuator/health
-> HTTP 200, {"status":"UP"}, time_total=0.460712

GET https://flownote-api-production.up.railway.app/socket.io/?EIO=4&transport=polling
-> Socket.IO handshake 응답 수신
```

현재 시점의 서비스는 살아 있다. 문제는 항상 재현되는 장애라기보다 특정 시점 또는 특정 캔버스 데이터 크기에서 발생하는 간헐 실패로 판단한다.

## 캔버스 불러오기 경로

프론트:

- `usePersistence.tsx`
- `handleLoad()`
- `fetchCanvasData()`
- `emitCanvasSocket("canvas:load")`

FastAPI:

- `flownote-API/app/canvas_socket.py`
- `canvas_load()`
- `_forward_json("GET", "/api/canvas/metadata...")`
- `_forward_json("GET", "/api/canvas/elements...")`

Spring:

- `CanvasController.elementsByQuery()`
- `CanvasService.elements()`
- `CanvasService.readElementArrays()`
- `CanvasService.readElementPayload()`

저장된 선/이미지/텍스트는 `canvas_elements` row와 object storage JSON으로 분리되어 있고, 불러올 때 Spring이 object key를 통해 각 JSON payload를 다시 조립한다.

## 관측된 증거

### 1. FastAPI 소켓은 정상 업그레이드됨

Railway `flownote-api` HTTP 로그에서 `/socket.io/` 요청은 WebSocket으로 업그레이드되었다.

예시:

```txt
2026-06-01T15:23:04Z
GET /socket.io/
responseDetails="connection upgraded to WebSocket"
totalDuration=1233ms
```

다른 예시:

```txt
2026-06-01T15:25:58Z
GET /socket.io/
responseDetails="connection upgraded to WebSocket"
totalDuration=162268ms
```

이는 연결 자체가 CORS나 도메인 설정 때문에 즉시 실패하는 상태는 아니라는 뜻이다.

### 2. FastAPI 애플리케이션 로그에는 WebSocket open/close가 반복됨

Railway `flownote-api` deploy 로그에서 다음 패턴이 보였다.

```txt
WebSocket /socket.io/?EIO=4&transport=websocket [accepted]
connection open
connection closed
```

특히 2026-06-01 15:23~15:26 UTC 구간에 connection open/closed가 짧은 간격으로 반복된다. 이는 브라우저 새로고침, 탭 이동, 네트워크 전환, 소켓 재연결, 클라이언트 timeout 등이 원인일 수 있다.

### 3. Spring 쪽에 `Broken pipe`와 `Connection reset by peer`가 반복됨

Railway `flownote-main` 로그에서 다음 경고가 반복된다.

```txt
AsyncRequestNotUsableException:
ServletOutputStream failed to write:
java.io.IOException: Broken pipe
```

일부 로그는 다음과 같다.

```txt
ServletOutputStream failed to write:
java.io.IOException: Connection reset by peer
```

이 메시지는 Spring이 응답을 쓰는 중 클라이언트 또는 중간 프록시가 먼저 연결을 끊었을 때 주로 발생한다. 캔버스 불러오기 흐름에서는 다음 상황과 연결된다.

- Spring이 큰 `elements` 응답을 만들거나 전송하는 중이다.
- FastAPI의 `forward_request()` 또는 클라이언트 소켓 ack timeout이 먼저 만료된다.
- 요청자가 연결을 끊으면 Spring은 남은 응답을 쓰다가 `Broken pipe`를 기록한다.

### 4. Railway HTTP 로그에서 배포 직후 `connection refused` 재시도가 보임

Railway `flownote-main` HTTP 로그에는 배포 직후 또는 서비스 wake-up 시점에 다음 패턴이 보인다.

```txt
upstreamErrors=[{"error":"connection refused", ...}]
httpStatus=200
totalDuration=4574ms ~ 8719ms
path=/api/canvas/documents
path=/api/canvas/folders
path=/api/notes
```

HTTP 상태는 최종적으로 200이지만, Railway edge가 upstream 연결을 여러 번 재시도하면서 전체 요청 시간이 늘어난다.

이 패턴은 캔버스 불러오기 실패의 직접 원인일 수도 있고, 최소한 실패 확률을 높이는 환경 요인이다. 특히 소켓 ack timeout이 있는 요청에서는 upstream 재시도 지연이 누적되면 클라이언트가 먼저 실패로 판단할 수 있다.

### 5. Vercel에는 원인 로그가 거의 없음

Vercel 쪽은 React SPA 정적 배포다. 캔버스 로딩 로직은 브라우저에서 실행되고, 실제 API/소켓 요청은 Railway로 간다. 따라서 `vercel logs`에서는 서버 함수 오류나 timeout 로그가 남지 않는다.

Vercel에서 확인할 수 있는 것은 배포 상태와 정적 서빙 상태이고, 캔버스 불러오기 실패 원인은 Railway와 브라우저 콘솔 쪽에 더 많이 남는다.

## 코드상 timeout 경로

프론트 `emitCanvasSocket()`는 Socket.IO ack timeout을 사용한다.

```ts
socket.timeout(timeoutMs).emit(eventName, payload, callback)
```

캔버스 load는 다음 timeout을 사용한다.

```ts
CANVAS_SOCKET_LOAD_TIMEOUT_MS = 90_000
```

FastAPI의 Spring proxy timeout도 90초다.

```py
urllib.request.urlopen(request, timeout=90)
```

따라서 `canvas:load`는 대략 다음 중 하나가 90초 안에 끝나야 성공한다.

1. FastAPI가 Spring metadata와 elements를 모두 받아온다.
2. Spring이 DB/Redis/object storage에서 elements를 조립한다.
3. FastAPI가 Socket.IO ack 응답으로 브라우저에 전달한다.
4. 브라우저가 받은 이미지 URL들을 추가로 로드한다.

대형 캔버스의 경우 2번과 3번이 가장 위험하다.

## 추정 원인

### 원인 1. 대형 캔버스 elements 응답 조립이 느림

`CanvasService.elements()`는 Redis cache를 먼저 확인하지만, cache miss 또는 revision 변경 후에는 `readElementArrays()`로 들어간다.

이 경로는 `canvas_elements` row를 읽고, 각 row의 `object_key`가 있으면 object storage에서 JSON을 읽는다.

```java
JsonNode payload = objectKey.isBlank()
    ? readJson(String.valueOf(row.get("payload")))
    : readJson(assetStorage.readJson(objectKey));
```

대형 선/이미지 데이터가 많으면 object storage read가 많아지고, 응답 조립 시간이 커진다. 이 시간이 길어지면 클라이언트 또는 FastAPI timeout에 걸린다.

### 원인 2. 저장 직후 cache invalidation으로 다음 load가 cold path를 탄다

`CanvasService.saveElements()`는 저장 시작 시 snapshot/cache를 무효화한다.

```java
invalidateElementSnapshot(userId, targetCanvasId);
```

저장 직후 다른 클라이언트가 `canvas:changed`를 받고 즉시 `canvas:load`를 호출하면, Redis/snapshot cache가 비어 있는 상태에서 object storage를 다시 많이 읽을 수 있다.

즉 “저장 성공 → 실시간 변경 알림 → 다른 클라이언트 즉시 load”가 가장 느린 경로가 될 수 있다.

### 원인 3. Railway 서비스 wake-up 또는 배포 직후 upstream 재시도 지연

Railway HTTP 로그에 `connection refused`가 여러 번 기록되면서 최종 200으로 끝나는 요청이 있다. 이 경우 사용자는 성공/실패가 섞여 보일 수 있다.

특히 Spring `flownote-main`의 serviceManifest에 `sleepApplication: true`가 보인다. 서비스가 sleep 상태에서 깨어나는 동안 첫 요청들은 지연되거나 재시도될 수 있다.

### 원인 4. 클라이언트가 먼저 연결을 끊는 케이스

Spring의 `Broken pipe`는 서버가 응답을 쓰는 도중 요청자가 먼저 연결을 끊었다는 뜻이다. 원인은 다음 중 하나일 수 있다.

- 브라우저 탭 이동 또는 새로고침
- Socket.IO ack timeout
- FastAPI proxy timeout
- Railway edge 또는 브라우저 네트워크 연결 종료
- 대형 응답 전송 중 사용자가 다른 캔버스로 이동

## 결론

이번 로그 분석 기준으로는 Vercel 자체 장애나 정적 배포 오류는 보이지 않는다. FastAPI 소켓 서버도 WebSocket handshake는 정상이다.

불러오기 실패의 더 그럴듯한 원인은 Spring 쪽 `elements` 응답 생성/전송이 느려지고, 이 과정에서 클라이언트 또는 FastAPI가 먼저 연결을 끊는 것이다. 이를 뒷받침하는 증거는 다음이다.

- Spring 로그의 반복적인 `Broken pipe`와 `Connection reset by peer`
- Railway HTTP 로그의 upstream `connection refused` 재시도 및 4~8초대 지연
- FastAPI socket 로그의 WebSocket open/close 반복
- Vercel 런타임 로그 부재
- 코드상 `canvas:load`가 전체 elements를 한 번에 ack 응답으로 돌려주는 구조

## 권장 대응

### 1. canvas load 단계별 서버 로그 추가

FastAPI `canvas_load()`에 다음 시간을 로그로 남긴다.

- socket event 수신 시각
- metadata 요청 소요 시간
- elements 요청 소요 시간
- 응답 payload 크기
- 예외 발생 시 canvasId와 status

Spring `CanvasService.elements()`에도 다음 시간을 남긴다.

- Redis cache hit/miss
- snapshot hit/miss
- `canvas_elements` row 수
- object storage read 개수
- `buildElementArrays()` 소요 시간
- 최종 response byte size

현재 로그는 `Broken pipe`만 보여주므로 정확히 어느 단계가 느린지 구분하기 어렵다.

### 2. load 응답을 분할하거나 증분화

현재 구조는 `canvas:load` 한 번에 metadata와 모든 elements를 가져온다. 대형 캔버스는 다음 방식이 더 안정적이다.

- metadata 먼저 응답
- viewport 주변 요소 우선 로드
- 선/이미지/텍스트를 타입별 또는 chunk 단위로 로드
- socket ack 하나에 대형 payload를 싣지 않고 progress event로 분할 전송

### 3. 저장 후 cache warm-up

저장 시 `invalidateElementSnapshot()`만 수행하면 다음 load가 cold path를 탈 수 있다. 저장 완료 후 비동기로 snapshot/Redis cache를 다시 채우는 warm-up을 추가하면, 다른 클라이언트의 `canvas:changed` 직후 load가 빨라진다.

### 4. Railway sleep 설정 재검토

`flownote-main`과 `flownote-api` 모두 사용자-facing 실시간 기능을 담당한다. sleep/wake 지연이 사용자 경험에 직접 영향을 주므로 운영 환경에서는 sleep 비활성화를 검토해야 한다.

### 5. 클라이언트 timeout 메시지 구분

현재 클라이언트는 많은 실패를 `불러오기 실패`로 묶는다. 다음처럼 구분하면 원인 파악이 쉬워진다.

- `소켓 응답 시간 초과`
- `서버 elements 조회 실패`
- `로컬 임시 저장본 사용`
- `이미지 로드 일부 실패`
- `원격 변경 대기 중`

## 추가 확인이 필요한 부분

- 실제 실패 시각의 브라우저 콘솔 timestamp
- 실패한 `canvasId`
- 해당 canvas의 `canvas_elements` row 수와 object storage JSON 총 크기
- Redis cache hit 여부
- `flownote-main`의 sleep 설정이 실제 운영에서 활성인지 여부

## 다음 액션 제안

1. FastAPI와 Spring에 canvas load tracing 로그를 추가한다.
2. 실패한 canvasId 기준으로 elements row 수와 object storage 총 크기를 산출한다.
3. 저장 직후 cache warm-up을 구현한다.
4. 대형 캔버스는 chunk load 또는 viewport load로 바꾼다.
5. Railway sleep 설정을 실시간 서비스에 맞게 조정한다.
