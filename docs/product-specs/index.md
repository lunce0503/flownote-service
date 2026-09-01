# 제품 사양 색인

제품 사양은 사용자 입장에서 보이는 행동을 기록한다. 구현 파일 목록보다 성공 기준, 데이터 흐름, 예외 상태를 먼저 쓴다.

## 기존 사양

- `mobile-was-architecture.md`: Expo 네이티브 앱과 Railway 웹 테스트 클라이언트의 gateway 통신, 캔버스 저장, 실행 방식.
- `expo-go-railway-access.md`: Railway production Metro를 통한 Expo Go 접속, iPhone·iPad·Android 사용 절차와 장애 대응.
- `web-workspace-ux.md`: 웹 홈·인증·Blog·Canvas의 상태 처리, 모바일 도구 배치, 키보드 접근성.
- `weekly-schedule-period-list.md`: 주간 일정 생성 시 여러 요일·시간 구간을 기간 리스트로 저장하는 흐름.
- `planner-daily-timetable.md`: 오늘 시간표의 24시간·5분 격자, 레거시 데이터 변환, 칠하기 되돌리기 동작.

## 사양 작성 기준

새 제품 사양은 다음 상황에서 작성한다.

- 사용자가 보는 주요 기능이 추가된다.
- 기존 화면의 핵심 흐름이 바뀐다.
- 외부 API나 모바일 앱처럼 실패 모드가 많은 기능이다.
- 에이전트가 사용자 맥락을 해석하는 방식이 바뀐다.

## 권장 형식

```md
# 기능 이름

## 목표

## 사용자 흐름

## 데이터와 API

## 빈 상태, 로딩, 오류 상태

## 검증
```
