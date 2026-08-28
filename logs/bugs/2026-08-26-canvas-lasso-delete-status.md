# Canvas 올가미 삭제 상태 오류

## 증상

- 올가미로 선택한 요소를 삭제해도 화면에서 사라지지 않았다.
- 저장 payload에 `deletedLines`가 없어서 새로고침 후에도 요소가 남았다.

## 원인

`useLassoActions.ts`가 `{ status: "deleted" }` 객체를 `markModified()`에 전달했다. `markModified()`는 새 요소가 아니면 항상 상태를 `modified`로 바꾸므로 삭제 상태가 즉시 덮어써졌다.

## 수정

- `canvasGeometry.ts`에 `removeOrMarkDeleted()`를 추가했다.
- 새 요소는 배열에서 제거하고 서버에 존재하는 요소는 `deleted` tombstone으로 남긴다.
- 올가미, 선 지우개, 이미지·텍스트 지우개가 같은 함수를 사용한다.
- E2E에서 렌더 입력의 표시 요소 수와 Socket.IO 저장 payload를 함께 검증한다.

## 검증

- 실패 재현: 올가미 삭제 후 `deletedLines`가 `undefined`인 것을 확인했다.
- 수정 후 지우개와 올가미 삭제 E2E가 통과했다.
- 전체 검증 및 배포 결과는 같은 작업의 `logs/report/` 보고서를 따른다.
