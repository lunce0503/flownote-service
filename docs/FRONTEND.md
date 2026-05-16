# Frontend Guide

## Scope

이 문서는 `flownote/`, `flownote-next/`, `flownote-mobile/`의 UI 변경 기준을 정리한다. 세부 구현 규칙은 `.codex/rules/typescript-react.md`와 `.codex/checklists/frontend.md`를 함께 본다.

## Product UI Principles

- 첫 화면은 실제 사용 흐름이어야 한다. 앱, 도구, 게임 요청에서 마케팅용 랜딩 페이지를 기본값으로 만들지 않는다.
- Flownote는 작업, 노트, 캔버스, 에이전트, 주식 관리가 있는 생산성 도구다. 화면은 스캔하기 쉽고 반복 작업에 효율적이어야 한다.
- 버튼에는 가능한 경우 `lucide-react` 아이콘을 사용한다.
- 카드 안에 카드를 중첩하지 않는다. 반복 항목, 모달, 도구 패널처럼 실제 프레임이 필요한 곳에만 카드를 쓴다.
- 모바일과 데스크톱에서 텍스트가 버튼이나 패널 밖으로 넘치지 않아야 한다.

## React App Patterns

- `flownote/src/app/routers/`는 라우트 진입점이다.
- 화면 단위는 `pages/`, 재사용 가능한 큰 UI는 `widgets/`, API와 타입은 `entities/`에 둔다.
- 인증이 필요한 화면은 기존 `ProtectedRoute` 패턴을 따른다.
- API 호출은 `shared/api`의 base URL과 auth header helper를 우선 사용한다.
- 사용자에게 보이는 새 기능은 loading, empty, error 상태를 포함한다.

## Mobile

- 모바일 앱은 Spring WAS 설정을 읽고 WebView를 연다.
- 실기기에서는 `localhost` 대신 개발 PC LAN IP를 사용한다.
- 모바일 기능 변경은 `docs/product-specs/mobile-was-architecture.md`와 함께 검토한다.

## Verification

- `cd flownote && yarn build`
- `cd flownote-next && yarn lint && yarn build`
- 모바일 정적 검증은 `cd flownote-mobile && yarn verify`
- 최종 통합은 저장소 루트에서 `docker compose up -d --build`
