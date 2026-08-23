# 기술 부채 추적기

단순 TODO가 아니라 **현재 증상 + 영향받는 흐름 + 해소 조건**으로 기록한다. 해소되면 해당 항목에 해소 커밋/문서를 남기고 취소선 처리한다.

## flownote (Vite SPA)

### 1. ~~웹 TypeScript gate 비활성~~ (2026-08-21 해소)
- **증상**: 2026-08-08 기준 `npx tsc -b`가 `tsconfig.app.json`의 잘못된 `ignoreDeprecations` 값에서 즉시 중단한다. `build` 스크립트가 `vite build` 단독이라 전체 타입 검사가 배포 gate에 포함되지 않는다.
- **영향**: 실제 타입 오류 수를 신뢰할 수 없고 타입 회귀를 CI가 차단하지 못한다.
- **해소 조건**: ① 현재 TypeScript 5.9와 맞는 설정으로 수정 ② 드러나는 타입 오류를 0으로 정리 ③ `build` 또는 Quality Gates에 `tsc -b` 추가.
- **해소 근거**: 잘못된 `ignoreDeprecations`를 제거하고 타입 오류를 정리했다. `yarn build`가 `yarn typecheck`를 선행하며 CI web job도 lint와 build를 실행한다.

### 2. ~~ESLint 일반 이슈 78건~~ (2026-08-21 해소)
- **증상**: 2026-08-08 기준 `yarn lint`가 65 errors, 13 warnings로 실패한다. 주요 유형은 미사용 변수, hooks 규칙, ref mutation, 명시적 `any`다.
- **영향**: lint를 CI 게이트로 못 올림.
- **해소 조건**: 파일 단위 정리 후 `yarn lint`를 CI/작업 완료 조건에 포함.
- **해소 근거**: 65 errors/13 warnings를 0으로 정리하고 `yarn verify` 및 CI 필수 단계에 `yarn lint`를 포함했다.

### 3. ~~Canvas.tsx 포인터 핸들러 미분할~~ (2026-08-21 해소)
- **증상**: `handlePointerDown/Move/Up`(~200줄)이 드로잉·스트리밍·터치 제스처 refs와 강결합으로 컴포넌트에 잔존.
- **영향**: 입력 처리 수정 시 여전히 큰 파일을 읽어야 함.
- **해소 조건**: 스트리밍 refs를 묶는 `useLineStreaming` 훅을 먼저 분리한 뒤 입력 훅 추출. 런타임 검증 수단(E2E) 확보 후 진행 권장.
- **해소 근거**: `useLineStreaming`과 `useCanvasPointerInput`을 추출했다. `Canvas.tsx`는 997줄에서 763줄로 감소했고 로그인→선 그리기→Socket.IO 저장 ack E2E가 통과한다.

### 4. ~~features/task·chat이 얇은 재수출 모듈~~ (2026-08-21 해소)
- **증상**: 액션 수준 로직 없이 entities를 재수출만 함(레이어 방향 확립 목적).
- **영향**: 낙관적 업데이트·캐시 무효화 로직이 생기면 위젯에 다시 스며들 위험.
- **해소 조건**: 다음 task/chat 기능 작업 시 위젯의 낙관적 갱신 로직(TaskTable의 handleStatusChange 등)을 features 훅으로 이관.
- **해소 근거**: 조회만 하던 `features/task`를 제거하고 entity query를 직접 사용한다. `features/chat`은 전송·삭제·전체 삭제의 낙관적 갱신과 실패 롤백을 소유한다.

### 5. ~~`entities/chat/model/index.ts`가 빈 파일~~ (2026-08-21 해소)
- **증상**: 0바이트 파일. 어떤 모듈도 import하지 않음.
- **영향**: 없음(혼란만 유발).
- **해소 조건**: chat 도메인 타입 정의 시 채우거나 삭제.
- **해소 근거**: 사용되지 않는 빈 파일을 삭제했다.

### 6. ~~번들 청크 3MB 경고~~ (2026-08-21 해소)
- **증상**: 2026-08-08 `vite build` 기준 main JS 약 3,139kB(gzip 985kB) 경고.
- **영향**: 초기 로드 성능.
- **해소 조건**: 라우트 단위 dynamic import(capabilityManifest가 자연스러운 분할점) 또는 manualChunks.
- **해소 근거**: capability route를 lazy import로 전환하고 편집기 vendor를 분리했다. 초기 entry는 약 3,139KB에서 294KB로 줄었고, 가장 큰 지연 로드 청크는 681KB로 700KB 회귀 기준 안에 있다.

## 저장소 운영

### 7. ~~프론트 런타임 E2E 부재~~ (2026-08-21 해소)
- **증상**: 캔버스 드로잉·소켓 협업·올가미 조작의 자동 검증 수단이 없음. 리팩터링 검증이 빌드+타입 동등성에 의존.
- **영향**: 대형 리팩터링·기능 변경의 회귀 리스크.
- **해소 조건**: Playwright 스모크(로그인 → 캔버스 선 그리기 → 저장 상태 확인) 1본이면 충분한 출발점.
- **해소 근거**: 독립 mock REST/Socket.IO 서버와 Chromium Playwright 스모크를 추가했다. UI 저장 상태뿐 아니라 서버가 수신한 `addedLines` 점 배열까지 확인한다.

### 8. ~~docs/가 gitignore — 지식 저장소가 커밋되지 않음~~ (2026-08-08 해소)
- `.gitignore`의 `docs/` 규칙을 제거해 새 System of Record 문서도 Git 변경으로 노출되게 했다.
