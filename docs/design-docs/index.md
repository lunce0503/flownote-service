# Design Docs Index

이 디렉터리는 장기 아키텍처 결정과 설계 문서를 둔다. 최상위 시스템 맵은 `docs/DESIGN.md`를 기준으로 하고, 도메인별 깊은 설계가 필요할 때 이곳에 파일을 추가한다.

## Current References

- `docs/DESIGN.md`: 하위 프로젝트, 서비스 경계, 데이터 소유권.
- `docs/HARNESS.md`: Codex 하네스 운영 모델.
- `docs/generated/db-schema.md`: PostgreSQL 스키마 참조.
- `docs/product-specs/mobile-was-architecture.md`: 모바일 WAS/WebView 구조.

## New Design Doc Criteria

새 설계 문서는 다음 중 하나를 만족할 때 만든다.

- 여러 하위 프로젝트가 영향을 받는다.
- API, DB, UI 계약이 함께 바뀐다.
- 운영 방식이나 배포 절차가 달라진다.
- 나중에 같은 결정을 반복하지 않도록 근거가 필요하다.

## Template

```md
# Title

## Context

## Decision

## Consequences

## Verification
```
