# 캔버스 되돌리기 후 재시도 루프 수정 (mutationId 멱등성 충돌 고착)

작성 2026-07-22 01:03 UTC. "캔버스에 작성하고 되돌리기를 하면 재시도 루프에 걸린다"는 증상의 원인을 특정하고 수정·배포했다.

## 원인 (명명)

**저장 멱등성 키(`mutationId`) 충돌 409가 재시도 큐에 고착되어 무한 반복된다.**

체인은 다음과 같다.

1. **서버는 `mutationId`를 payload 해시와 함께 기록한다.** `flownote-canvas/internal/canvas/repo.go:264-281`에서 같은 `mutationId`가 **다른 payload 해시**로 들어오면 `409 "동일한 mutationId에 다른 저장 내용이 전달되었습니다."`를 반환한다. 이 409는 같은 조합인 한 **영구 실패**다(`retryable:false`).
2. **되돌리기가 대기 중 payload를 바꾼다.** 저장이 실패로 큐에 들어간 뒤(또는 전송 중) undo가 실행되면 `buildUndoTombstone`/`restoreExistingElement`가 요소 상태를 `deleted`/`modified`로 바꿔 `buildCurrentSavePayload()` 결과가 달라진다. 즉 이미 서버에 기록된 `mutationId`와 payload의 짝이 깨진다.
3. **클라이언트가 영구 오류를 일시 오류로 취급했다.** `canvasSocketClient.ts`의 `emitCanvasSocket`이 서버가 준 `status`/`retryable`을 버리고 `new Error(message)`로만 reject해, 호출부가 409를 구분할 수 없었다.
4. **충돌한 mutationId가 큐에 고정됐다.** `usePersistence.tsx`의 `handleSave` catch가 실패한 `activeMutation.mutationId`를 그대로 `addCanvasRetryQueueItem`에 넘기고, `retryPendingSaves`는 payload가 그대로면 **같은 (mutationId, payload)** 를 다시 보낸다 → 같은 409 → 백오프만 최대 5분까지 증가하며 **영원히 "재시도" 상태**.

## 실증 (스테이징)

가설이 아니라 실제 소켓 시퀀스로 재현·검증했다.

| 단계 | 요청 | 응답 |
| --- | --- | --- |
| 1 | `(M, payloadA)` 저장 | ok, revision 2 |
| 2 | undo로 payload가 B로 바뀐 뒤 같은 `M` 재사용 | **409** `retryable:false` |
| 3 | 동일 조합 재시도 | **409 반복** ← 사용자가 겪는 루프 |
| 4 | **새 mutationId + 같은 payload B** | **ok, revision 3** |
| 5 | 또 다른 새 mutationId로 같은 삭제 재전송 | ok, revision 4 (멱등) |

부수 확인: 존재하지 않는 요소 삭제는 no-op으로 성공하고(`deleteElements`는 `DELETE ... id = ANY($4)`), 추가는 upsert라 중복도 안전하다. 즉 **undo가 만드는 payload 자체는 문제가 없고**, 문제는 멱등성 키 고착이다.

## 수정

**1) 서버 오류의 `status`/`retryable` 보존** — `flownote/src/features/canvas/model/canvasSocketClient.ts`

- `CanvasSocketResponse`에 `retryable` 추가.
- `CanvasSocketError`(`status`, `retryable` 보유) 도입, `emitCanvasSocket`이 이걸로 reject.
- `isCanvasMutationConflict(error)` = `status === 409` 헬퍼 추가.

**2) 충돌 시 mutationId 재발급으로 자가 치유** — `flownote/src/features/canvas/model/usePersistence.tsx`

- `retryPendingSaves` catch: 409면 `mutationId`를 새로 발급하고 `nextAttemptAt = now`로 **백오프 없이 즉시 재시도**(`attempts`도 증가시키지 않음). 재적용은 upsert/삭제 모두 멱등이라 안전하다.
- `handleSave` catch: 409로 실패한 경우 충돌한 `mutationId` 대신 **새 mutationId로 큐에 적재**해, 다음 시도가 같은 409를 반복하지 않게 한다.

## 검증

- `yarn build` ✓ (11.12s)
- 변경 파일 lint: **신규 이슈 없음**. 남은 3건은 기존 문제(`canvasSocketClient.ts:180`의 기존 `throw`, `usePersistence.tsx:614·867`의 기존 ref 대입).
- 스테이징 실증: 위 표 4·5단계로 자가 치유·멱등 재적용 확인.
- Docker 통합 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` **성공(exit 0)**, react·api·canvas·serve·spring·next·mobile 재기동, db/redis/ollama healthy. `ai-server`만 `sh: uvicorn: not found`로 Restarting — 이번 변경은 `flownote/` 프론트 2개 파일뿐이라 **무관한 사전 존재 로컬 이슈**(이전 세션들에서도 동일 관측, 프로덕션 flownote-ai는 정상).

## 배포

| 대상 | 결과 |
| --- | --- |
| Vercel `flownote-react` (production) | READY · https://flownote-react.vercel.app |
| Vercel `flownote-react-staging` | READY · https://flownote-react-staging.vercel.app |

Railway 배포 생략: 이번 변경은 `flownote/`(프론트) 전용으로 백엔드 실행 산출물 변화 없음. `flownote/.vercel` 링크는 프로덕션으로 원복 완료.

## 후속 여지

- 409 외의 영구 4xx(예: 권한/검증 실패)도 현재는 무한 재시도 대상이다. `retryable === false`를 일반적으로 존중해 큐에서 제거하고 사용자에게 실패를 알리는 처리로 넓힐 수 있다.
- 되돌리기로 "아직 저장되지 않은(new) 요소"를 제거하면 서버에 이미 저장된 사본이 남을 수 있다(commit 스킵 경로). 별도 정합성 점검 대상.
