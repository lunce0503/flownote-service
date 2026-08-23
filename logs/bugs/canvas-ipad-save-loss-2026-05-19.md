# iPad 브라우저 캔버스 저장 누락

## 증상

- iPad 브라우저에서 캔버스 작업 후 일부 선, 이미지, 텍스트 요소가 저장되지 않을 수 있다.
- 특히 작업 직후 탭을 전환하거나 Safari를 백그라운드로 보내면 마지막 변경분이 누락될 수 있다.

## 원인

- 캔버스 저장은 상태 변경 후 1초 뒤 실행되는 자동저장에만 의존했다.
- iPad Safari는 페이지가 숨겨지거나 종료될 때 지연된 타이머와 일반 fetch 요청을 완료하지 못할 수 있다.
- 블로그 편집기는 `visibilitychange`, `pagehide`, `beforeunload`에서 `keepalive` 저장을 수행하지만, 캔버스에는 같은 보호 장치가 없었다.

## 수정

- 캔버스 저장 payload 생성 로직을 공통 함수로 분리했다.
- 자동저장 지연을 350ms로 줄였다.
- `visibilitychange`, `pagehide`, `beforeunload` 시점에 pending 캔버스 변경을 `fetch(..., { keepalive: true })`로 즉시 저장하도록 추가했다.
- 큰 payload는 브라우저 keepalive 제한을 피하기 위해 일반 fetch로 폴백한다.

## 검증

- `flownote/`에서 `yarn build` 성공.
