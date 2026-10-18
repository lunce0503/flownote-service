# 플래너 10분 경계선

## 변경

- 일간 시간표의 5분 입력 단위는 유지한다.
- 매 10분 경계는 `#a3a3a3`, 중간 5분 경계는 `#eeeeee`로 그려 시각적 구분을 강화했다.
- 매시 시작과 끝 경계는 `#737373`, 1.5px로 표시한다.

## 검증

- `cd flownote && yarn typecheck`: 통과
- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn build`: 통과
- staging 클라우드 E2E: 11개 통과
- 실제 planner canvas 픽셀에서 10분 경계가 5분 경계보다 어두운지 검증했다.

## 배포

- staging: `dpl_Ef5PtvwHEBeoLM9BM2y25mwy8qfs` (`READY`)
- production: `dpl_7yfnYy1Y86md6crw6ZgZX3YcBpQP` (`READY`)
- staging과 production canonical URL: HTTP 200
- fingerprint: `fc762b50bc06c543bff9f7a8af455e2236b0d8bdebdc2ab34d02f7ae1c574428`
