# Planning And Execution Records

계획은 일회성 대화가 아니라 재사용 가능한 작업 아티팩트다. 짧은 수정은 응답 안의 계획으로 충분하지만, 여러 하위 프로젝트나 DB/API/UI를 함께 바꾸는 작업은 이 문서 기준으로 기록한다.

## When To Write A Plan

- DB migration, API 계약, UI 흐름이 함께 바뀐다.
- 구현자가 선택할 여지가 많은 기능이다.
- 검증 단계가 여러 하위 프로젝트에 걸친다.
- 사용자 피드백, 버그 재현, 운영 리스크를 나중에 다시 추적해야 한다.

## Plan Shape

계획은 다음 정보를 포함한다.

- 목표와 성공 기준
- 영향받는 하위 프로젝트
- API, 타입, DB 스키마 변경
- UI/UX 동작과 에러/빈 상태
- 검증 명령
- 명시적 가정과 제외 범위

## Active Work

현재 장기 실행 계획은 별도 파일이 없으면 대화 컨텍스트와 최종 응답에 남긴다. 반복될 계획은 `docs/design-docs/` 또는 `docs/product-specs/`로 승격한다.

## Completed Work

완료된 계획은 다음 중 하나로 정리한다.

- 제품 기능이면 `product-specs/`에 최신 동작 기준을 반영한다.
- 아키텍처 결정이면 `design-docs/`에 결정 이유와 영향 범위를 남긴다.
- 품질 또는 운영 개선이면 `QUALITY_SCORE.md` 또는 `RELIABILITY.md`에 검증 기준을 갱신한다.

## Technical Debt

기술 부채는 단순 TODO보다 구체적이어야 한다.

- 문제의 현재 증상
- 영향받는 사용자 또는 개발 흐름
- 권장 수정 방향
- 검증 방법
- 나중에 제거할 임시 우회책
