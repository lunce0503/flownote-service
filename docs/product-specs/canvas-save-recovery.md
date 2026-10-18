# 캔버스 저장과 동기화 복구

## 사용자 행동

- 일반 저장과 큰 저장은 같은 저장 상태를 표시한다. 900,000 bytes를 초과하는 요청은 자동으로 HTTP를 사용하며 연결된 다른 기기에 변경을 알린다.
- 저장 요청이 32MiB를 초과하거나 서버가 재시도 불가 오류를 반환하면 자동 저장 반복을 멈추고 `자동 재시도 중단 · 초안 보존됨` 상태를 표시한다.
- 초안과 실패한 mutation은 IndexedDB에 남는다. 페이지를 다시 열거나 네트워크가 복구돼도 중단된 동일 요청을 자동 재전송하지 않는다.
- 사용자가 내용을 바꾸면 새 mutation으로 다시 시도한다. 수동 저장 또는 재시도 명령도 명시적으로 한 번 다시 시도한다.
- 일시적 연결 오류는 지수 backoff로 재시도한다. 재접속 자체가 대기 시간을 초기화하지 않는다.

## 통신 계약

- 소켓 `canvas:save`와 HTTP `POST /api/canvas/save`는 같은 envelope(`canvasId`, `mutationId`, `payload`, `trigger`, `operationId`, `clientCreatedAt`)와 `{ok,data,status,error,retryable}` 응답을 사용한다.
- HTTP 인증은 `Authorization` 헤더가 기준이며 JSON 본문의 인증 값은 사용하지 않는다. 큰 본문 전달 전에 Spring에서 세션을 검증하고, 실제 캔버스 접근 권한은 기존 Go 저장 API에서 검증한다.
- Go 저장 성공 후 `canvas:changed`를 전송한다. 알림 실패를 저장 실패로 바꾸지 않는다. 256KiB 초과 델타는 생략하고 수신 기기가 전체 데이터를 조회한다.
- 노트/캔버스 목록 변경 알림은 게이트웨이 `/sync` namespace의 사용자별 room을 사용한다. 제거된 Next SSE endpoint는 호출하지 않는다.
- Socket.IO 연결 복구 후 `all/reconnected` 이벤트를 받으면 기존 구독자가 데이터를 다시 조회한다. 이벤트 자체는 영속 이력이 아니다.

## 검증

- 게이트웨이 pytest: 큰 HTTP 요청, 상한 초과, 헤더 인증, 권한 실패, mutation 보존, broadcast 실패 후 저장 응답, 사용자별 동기화와 인증 거부.
- Playwright: 1MB 초과 HTTP 저장 후 소켓 유지, 동일 mutation 재전송, 영구 실패 후 재접속/새로고침 시 초안 보존, 기기 간 이벤트 및 재접속 복구.
