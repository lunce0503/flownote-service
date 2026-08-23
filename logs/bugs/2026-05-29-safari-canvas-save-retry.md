# 2026-05-29 Safari canvas save retry

## Symptom

- iPad Safari에서 그림판 작성 후 저장된 내용이 서버에 반영되지 않는 사례가 발생했다.
- Railway 로그에는 캔버스 저장 시점에 PostgreSQL 커넥션이 닫혀 `CanvasService.saveElements` 요청이 실패한 기록이 있었다.
- 기존 프론트 저장 로직은 실패를 콘솔에만 남겨 사용자가 저장 실패 여부를 확인할 수 없었다.

## Cause

- Safari의 `pagehide`/백그라운드 전환 시점에 대용량 캔버스 저장 요청이 취소될 수 있다.
- Railway/Postgres 연결이 끊긴 뒤 Hikari가 오래된 커넥션을 검증하다 실패하면 저장 요청이 5xx로 끝날 수 있다.
- 실패한 payload를 내구성 있는 재시도 큐에 남기는 처리가 없었다.

## Fix

- 프론트 캔버스 저장 상태를 `저장 중`, `저장 완료`, `저장 실패`, `재시도 중`으로 표시한다.
- 저장 실패 payload를 `localStorage` 재시도 큐에 저장하고 다음 로드/저장/수동 재시도 시 재전송한다.
- 페이지 이탈 저장은 요청 전에 payload를 큐에 먼저 넣고, 서버 성공 응답이 확인되면 큐에서 제거한다.
- Spring Boot Hikari 설정을 Railway Postgres에 맞춰 더 짧은 `max-lifetime`, `keepalive-time`, `connection-timeout` 기본값으로 조정한다.

## Verification

- 프론트 빌드와 Spring Boot 테스트를 실행한다.
- 통합 Docker 빌드를 실행해 서비스 경계를 확인한다.
