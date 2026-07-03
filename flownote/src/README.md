# Flownote Frontend FSD

`src`는 Feature-Sliced Design 레이어를 기준으로 관리한다.

- `app`: 라우팅, 전역 provider, 앱 초기화
- `pages`: 라우트 단위 페이지 조합
- `widgets`: 페이지를 구성하는 독립 UI 블록
- `features`: 사용자 행동 중심 기능 로직
- `entities`: 도메인 모델, 타입, API
- `shared`: 재사용 가능한 UI, lib, config, auth, API 기반

의존 방향은 항상 위에서 아래로 흐른다.

```text
app -> pages -> widgets -> features -> entities -> shared
```

하위 레이어가 상위 레이어를 import하지 않는다. 특히 `entities`는 `widgets`나 `pages` 타입을 참조하지 않고, 도메인 타입은 각 entity의 `model/types.ts` 또는 public API인 `index.ts`에서 export한다.

상위 레이어에서는 가능하면 슬라이스 내부 파일 대신 public API를 import한다.

```ts
import { TaskWidget } from "../../widgets";
import type { TaskProps } from "../../entities/task";
```
