# 캔버스 필기 직후 렌더링 딜레이 수정 (zIndex 재배치 O(n²) + 공간 인덱스 재구축)

작성 2026-07-21 14:37 UTC. "캔버스에 살짝 작성 후 렌더링 중 앱 딜레이" 증상의 원인 2건을 제거했다.

## 원인 1 (주범): `applyLayerOrder`의 O(n²) Konva 재배치

`flownote/src/features/canvas/model/useCanvasRendering.tsx`

`applyLayerOrder`가 순서 시그니처가 바뀌면 **모든 노드**에 `node.zIndex(index)`를 호출했다. Konva의 `setZIndex`(`konva/lib/Node.js:793-810`)는 1회 호출이 O(n)이다:

- `children.splice(index, 1)` + `children.splice(zIndex, 0, this)`
- `parent._setChildrenIndices()` — 전체 자식 순회 + `_requestDraw()` (`konva/lib/Container.js:155-161`)

문제는 **획을 하나 그릴 때마다 새 id가 추가되어 시그니처가 반드시 바뀐다**는 점. 결과적으로 필기 1획마다 전체 노드 재배치 = **O(n²)** + `_requestDraw()` n회. 선·이미지·텍스트 3개 그룹에서 각각 발생. `8c94f3f feat(canvas): add zIndex management...`에서 유입된 회귀다.

**수정**: 오름차순으로 훑으며 **실제 위치가 어긋난 노드만** 이동한다.

```js
orderedIds.forEach((id, index) => {
  const node = nodes.get(id);
  if (!node || node.index === index) return;
  node.zIndex(index);
});
```

- 정합성: 앞쪽 index는 이미 확정되어 있고, 뒤에서 앞으로 끌어오는 이동은 `index < i` 구간을 건드리지 않으므로 최종 순서가 동일하다.
- `node.index` 신뢰성 확인: Konva는 `add`(`Container.js:55` `child.index = children.length`)·`remove`(`Node.js:458-461` splice + `_setChildrenIndices`)·`setZIndex`에서 index를 항상 갱신한다.
- 효과: zIndex를 명시적으로 바꾸지 않은 일반적인 append 상황에서 **이동 0회**.

## 원인 2: 획마다 공간 인덱스 전체 재구축

`flownote/src/features/canvas/model/useDrawing.tsx`

```js
const lineSpatialIndex = useMemo(() => new CanvasSpatialIndex(drawnLines), [drawnLines]);
```

`drawnLines`가 바뀔 때마다(=획 완료마다) RBush를 통째로 재구축했고, `getLineBounds`가 **모든 선의 모든 점**을 순회한다(O(전체 점 수)). 정작 사용처는 지우개(`eraseAtPointer`)뿐이다.

**수정**: 지연 생성 + 동일 `drawnLines` 동안 캐시 재사용.

```js
const lineSpatialIndexRef = useRef<{ source: LineElement[]; index: CanvasSpatialIndex } | null>(null);
const getLineSpatialIndex = useCallback(() => {
  const cached = lineSpatialIndexRef.current;
  if (cached && cached.source === drawnLines) return cached.index;
  const index = new CanvasSpatialIndex(drawnLines);
  lineSpatialIndexRef.current = { source: drawnLines, index };
  return index;
}, [drawnLines]);
```

펜으로 필기하는 경로에서는 인덱스 구축 비용이 **완전히 사라진다**(지우개를 실제로 쓸 때만 1회 구축). 미사용이 된 `useMemo` import 정리.

## 검증

- `yarn build` ✓ (11.13s)
- 변경 파일 lint: 신규 이슈 없음. `useCanvasRendering.tsx` 경고 9건은 기존 ref-cleanup 경고, `useDrawing.tsx`의 `'tool' is defined but never used` 에러는 **커밋본에도 이미 존재**(시그니처에만 등장)하는 기존 문제로 이번 변경과 무관.
- Docker 통합 빌드: `REDIS_HOST_PORT=6380 docker compose up -d --build` — **성공(exit 0)**. react·api·canvas·serve·spring·next·mobile 정상 기동, db/redis/ollama healthy. `ai-server`만 `sh: uvicorn: not found`로 Restarting인데, 이번 변경은 `flownote/`(프론트) 3개 파일뿐이라 **무관한 사전 존재 로컬 이슈**(직전 세션에서도 동일 관측, 프로덕션 flownote-ai는 정상).

## 배포

| 대상 | 배포 | 결과 |
| --- | --- | --- |
| Vercel `flownote-react` (production) | `vercel --prod` | READY · https://flownote-react.vercel.app · asset `index-DP65QkdB.js` · HTTP 200 |
| Vercel `flownote-react-staging` | `vercel --prod`(재링크 후 원복) | READY · https://flownote-react-staging.vercel.app · asset `index-NiT48i1A.js` |

- Railway 배포 생략 사유: 이번 변경은 `flownote/`(프론트) 전용이라 백엔드 실행 산출물 변화 없음. `flownote/.vercel` 링크는 프로덕션(`flownote-react`)으로 원복 완료.

## 남은 개선 여지 (미적용)

- 재조정 파이프라인의 `[...drawnLines, ...remoteStreamingLines]` 스프레드 + `sortByZIndex`(map→sort→map) ×3 + 전체 노드 `.visible()` 순회는 여전히 획마다 O(n). 필요 시 정렬 결과 캐시·가시성 증분 갱신으로 추가 최적화 가능.
- 드래프트 Worker `postMessage`의 구조화 복제는 메인 스레드 비용(필기 정지 1.5초 뒤 1회). 증분 전송으로 줄일 수 있다.
