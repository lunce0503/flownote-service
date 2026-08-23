# 캔버스 mutation 멱등성과 불러오기 큐

## 증상

- 클라이언트가 저장 응답을 받지 못하면 Spring에서 완료된 요청을 새로운 저장으로 다시 처리할 수 있었다.
- 재시도 큐가 원래 payload를 최신 payload로 교체해 논리적으로 다른 저장을 같은 재시도로 취급했다.
- 캔버스 전환, 수동 불러오기, 원격 변경 불러오기가 동시에 실행될 수 있어 늦게 도착한 이전 캔버스 응답이 현재 상태를 덮을 수 있었다.

## 수정

- `canvas_mutations` ledger를 추가하고 `(canvas_id, mutation_id)`를 기본 키로 사용한다.
- Spring은 payload SHA-256을 기록하고 동일 mutation과 동일 payload에는 기존 revision을 반환한다.
- 동일 mutation에 다른 payload가 전달되면 `409 Conflict`를 반환한다.
- FastAPI는 mutation ID를 검증하며 구버전 요청에는 UUID를 발급한다.
- 클라이언트 재시도 항목은 mutation ID와 원본 payload를 함께 저장하고 재시도 동안 변경하지 않는다.
- 재시도 대기 중 새 편집은 기존 mutation 완료 후 새 mutation으로 저장한다.
- 불러오기는 `selection`, `manual`, `remote` 트리거를 단일 실행 큐로 병합한다.
- 각 불러오기는 시작 시 canvas ID를 캡처하고 적용 직전 현재 canvas ID와 다시 비교한다.

## 응답 계약

```json
{
  "mutationId": "uuid",
  "revision": 42,
  "duplicate": false
}
```

중복 요청은 같은 revision과 `duplicate: true`를 반환한다.
