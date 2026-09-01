# Expo Go 모바일 라우터 계층 및 로그인 게이트 적용 보고서

- 작업 시각: 2026-08-29 04:39 UTC
- 대상: `flownote-mobile/`, 모바일 제품 명세, Railway Production의 `flownote-expo-go`
- 목적: Account/Workspace 탭 중심 구조를 로그인 게이트, 홈, 기능 목록, 세부 편집 화면의 계층 구조로 변경한다.

## 결과

앱 최초 진입점에서 저장된 세션을 확인한다. 세션이 없으면 로그인 화면으로, 세션이 있으면 홈으로 이동한다. 로그인 성공 시 홈을 현재 화면으로 교체하며 로그아웃 또는 토큰 소실 시 보호 라우터가 로그인으로 되돌린다.

라우터 구조는 다음과 같다.

```text
/
├─ /login
└─ /home
   ├─ /tasks            목록·생성
   │  └─ /tasks/[taskId]       조회·편집·삭제
   ├─ /notes            목록·생성
   │  └─ /notes/[noteId]       조회·편집·삭제
   ├─ /canvas           폴더·캔버스 목록·생성
   │  └─ /canvas/[canvasId]    선택 캔버스 편집
   └─ /agent            단일 기능 화면
```

기존 `(tabs)` 라우터와 예제 `explore`, `modal` 화면은 제거했다. 홈은 기능 진입점과 계정 요약/로그아웃을 제공하며, 태블릿 폭(720px 이상)에서는 기능 카드를 2열로 배치한다. 목록 화면에는 로딩, 빈 상태, 오류 및 재시도 상태를 두었다.

웹 BlockNote에서 생성한 구조화 노트는 모바일 편집기가 평문으로 덮어쓰지 않도록 본문을 읽기 전용으로 표시하고 제목만 저장한다. 모바일 평문 형식의 노트는 제목과 본문을 모두 편집할 수 있다.

## 주요 변경 파일

- `flownote-mobile/app/index.tsx`: 세션 판정 진입점
- `flownote-mobile/app/(auth)/login.tsx`: 로그인 후 홈 교체 이동
- `flownote-mobile/app/(app)/_layout.tsx`: 인증이 필요한 상위 Stack
- `flownote-mobile/app/(app)/home.tsx`: 기능 홈과 반응형 카드
- `flownote-mobile/app/(app)/tasks/`: 작업 목록 및 세부 편집
- `flownote-mobile/app/(app)/notes/`: 노트 목록 및 세부 편집
- `flownote-mobile/app/(app)/canvas/`: 캔버스 목록 및 세부 편집
- `flownote-mobile/lib/note-content.ts`: 노트 형식 판정 및 안전한 평문 변환
- `flownote-mobile/scripts/route-structure.test.mjs`: 정적 라우터 구조 회귀 테스트

## 검증

### 모바일 프로젝트

- `npm run lint`: 성공
- `npm run typecheck`: 성공
- `npm test`: 7개 테스트 성공
- `npm run verify`: 성공
  - lint, typecheck, 테스트, Expo web export 모두 성공
  - 정적 라우트에 홈, 로그인, 기능 목록 및 동적 세부 라우트 포함 확인
- 로컬 정적 서버 HTTP 확인: `/`, `/login`, `/home`, 목록·세부 예시 경로, `/agent`, `/health` 모두 200
- `git diff --check`: 성공

Expo typed-route 캐시가 기존 `(tabs)`와 `/modal`을 가리켜 최초 typecheck가 실패했으나 Expo 라우트 타입을 재생성한 뒤 정상 통과했다.

### Docker 통합 검증

`REDIS_HOST_PORT=6380 docker compose up -d --build`가 성공했다. 7개 이미지를 빌드하고 9개 컨테이너를 시작했으며 PostgreSQL, Redis, Ollama가 healthy 상태였다. React, API config, Spring, Canvas, 정적 serve, 모바일 manifest HTTP 확인도 모두 200이었다.

## Railway Production 배포

- 프로젝트: `flownote` (`07ae56ef-08be-432d-948b-8f3b6ecb6cd5`)
- 환경: Production (`ae55fc37-9251-48d1-bdbe-87a2ea3462fa`)
- 서비스: `flownote-expo-go` (`ce14582c-b711-4a7f-accb-7f48bf8e5cb1`)
- 배포 ID: `451ad634-8213-4c37-b47b-2ed9426d7d58`
- 상태: `SUCCESS`
- HTTPS: `https://flownote-expo-go-production.up.railway.app`
- Expo Go: `exps://flownote-expo-go-production.up.railway.app`

iOS와 Android manifest가 모두 HTTP 200과 `exposdk:54.0.0`을 반환했다. 각 플랫폼 번들도 HTTP 200이며 `/home`, `/tasks/[taskId]`, `/notes/[noteId]`, `/canvas/[canvasId]` 문자열을 포함하는 것을 확인했다.

이번 변경은 모바일 클라이언트와 모바일 명세에 한정되어 Vercel 및 `flownote-api`, `flownote-main`은 재배포하지 않았다.

## 롤백

문제가 발견되면 직전 성공 배포 `e44f313d-0c4d-4cac-8dbc-0aee4291980e`를 `flownote-expo-go` Production에 재배포한다.

## 남은 확인과 위험

- 실제 사용자 자격 증명이 없어 Production에서 로그인부터 CRUD까지의 인증 사용자 흐름은 자동 실행하지 못했다.
- 실제 iPhone/iPad/Android 기기에서 화면, 키보드, 태블릿 2열, Apple Pencil 동작은 별도 실기기 확인이 필요하다.
- 인증 토큰은 현재 AsyncStorage를 사용한다. 배포용 네이티브 앱 단계에서는 SecureStore 이전을 검토해야 한다.
- AI 기능의 인증 컨텍스트 격차와 Canvas 실시간 충돌 처리 및 Apple Pencil 최적화는 이번 라우터 작업 범위 밖의 기존 과제로 남는다.
- 기존 의존성 감사에서 확인된 Expo 패치 버전 불일치와 취약 패키지 항목은 별도 의존성 정비가 필요하다.
