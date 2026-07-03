# TypeScript 및 React 규칙

- 암묵적 `any`보다 TypeScript 타입을 우선한다.
- 로컬 패턴에서 분리되어 있다면 데이터 접근, 뷰 상태, 표현을 React 컴포넌트 하나에 섞지 않는다.
- 각 앱의 기존 라우팅 모델을 따른다. `flownote/`는 Vite 앱 컨벤션, `flownote-next/`는 Next app-router 컨벤션을 따른다.
- 새 의존성을 추가하기 전에 기존 UI 라이브러리와 아이콘 라이브러리를 사용한다.
- 사용자에게 보이는 비동기 상태는 loading, empty, error, success를 명시적으로 다룬다.
- 서버 컴포넌트나 공유 모듈에서 브라우저 전용 API를 직접 사용하지 않는다.
- Next.js API route는 입력을 검증하고, 기존 로컬 헬퍼가 있으면 DB 접근을 그 뒤에 격리한다.
- UI 변경 시 모바일 레이아웃, 텍스트 줄바꿈, overflow, 키보드 포커스, 시각적 겹침을 확인한다.
- 기본 검증:
  - `flownote/`: `yarn build`
  - `flownote-next/`: `yarn lint`, `yarn build`
