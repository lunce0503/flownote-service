# 미처리 사용자 피드백 반영

## 범위와 결과

실패 큐에 보관된 사용자 피드백 3건을 확인하고 현재 작업 트리에서 직접 구현했다. 자동 분석을 재실행해 구현했다고 기록하지 않는다. 기존 사용자 변경은 유지했다.

- 프로필: 설정에서 사용자 이름·표시 이름·이메일을 수정한다. 인증된 본인만 변경하며 이메일 변경에는 현재 비밀번호를 확인한다. 중복 이메일은 409, 인증 누락은 401, 비밀번호 확인 누락은 403이다. 저장 결과는 로그인 상태와 캐시에 반영한다.
- 캔버스 버튼: 기존 노란 둥근 네모 목록 버튼을 흰 배경의 원형 버튼으로 통일했다.
- 캔버스 → 플래너: 텍스트 박스에서 날짜·시간과 작업·일정 후보를 제안한다. 사용자가 수정·확인한 뒤 추가해야 저장된다. 기존 일기·할 일·필기·시간표를 유지하며 겹치는 시간은 거부한다. 데스크톱 버튼과 모바일 파일 동작 메뉴에서 접근한다.

TDD 지침에 따라 새 동작의 회귀 테스트를 추가했다. 보안·API 계약 검토는 본인 범위 제한과 이메일 변경 비밀번호 확인에 반영했고, UX 검토는 모바일 접근·화면 넘침·저장 상태 확인에 반영했다.

## 검증

- `node --test flownote/src/features/planner/model/canvasPlannerSuggestions.test.mjs`: 4/4 통과.
- `flownote-server/`의 `./gradlew test`: 11/11 통과(프로필 5, 인증 3, 모바일 설정 3).
- `flownote/`의 `yarn build`: 타입 검사·프로덕션 번들 통과.
- 변경 프론트엔드 파일 대상 ESLint, `node --check scripts/deploy-cloud.mjs`, `node scripts/check-cloud-config.mjs`, `git diff --check`: 통과.
- 실제 클라우드 스테이징 Playwright: 17/17 통과. 프로필 저장·이메일 변경·새 이메일 로그인, 캔버스 제안의 작업·일정 생성, 기존 플래너 내용 보존, 모바일 접근을 포함한다. 운영 데이터로 기능 테스트하지 않았다.
- 첫 release는 검증 도중 기존 버튼 테스트의 기대값을 변경해 소스 동일성 보호 장치가 운영 배포를 차단했다. 보호 장치를 우회하지 않고 최종 소스로 release 전체를 재실행했다.

## 배포

명령: `node scripts/deploy-cloud.mjs release feedback`. `feedback` 대상은 변경된 main과 web을 함께 스테이징 검증하고 같은 소스를 production으로 배포한다. API·canvas·serve 등 변경 없는 백엔드는 별도 배포하지 않았다.

- 소스 지문: `f68f6560979de9051347e491f18cede08f4bb430e4db2fd36245504df20854b2`
- 스테이징 main: `9a363853-b2f8-43a8-9907-69ebd206e5c2`, SUCCESS.
- 스테이징 web: `dpl_AKyjv6T8xhmHT9YbmP5GZV5gVS7t`, READY. <https://flownote-react-staging-kkp563fko-flownote-service.vercel.app>
- 운영 main: `48da51f2-9ac4-4159-8cb5-7413bcd67e8b`, SUCCESS.
- 운영 web: `dpl_9PvWm5uLKpybG1Vx5uAGeDdUHmv3`, READY. <https://flownote-react-x8hexv3un-flownote-service.vercel.app>
- 운영 진입점: <https://flownote-react.vercel.app>
- 양쪽 환경의 웹 HTML·JS/CSS 자산·API 200, 비인증 `/api/users/me` 401, 모바일 설정 200과 환경별 URL 격리 검사 통과.
- 배포 영수증: `.release/staging-feedback.json`, `.release/production-feedback.json`.

## 자동화와 처리 이력

- 2026-10-06 11:35:43 UTC 수집을 수동 실행: `queued=0 next_cursor=14`, 서비스 종료 0. 추가 접수 없음.
- 피드백 수집은 매일 00:00 UTC(한국시간 09:00, 최대 15초 지연), timer enabled/active. weekly timer도 enabled/active.
- 분석·알림 모델은 `gpt-6.1-sol`, 기본 OpenAI 구성과 ChatGPT 인증을 유지한다.
- 실패 원인은 이전 FactChat 환경 키 누락에 따른 종료 78이었다. 운영 검증 후 dispatcher lock을 잡고 해당 3건만 완료 큐로 이동했다. 원본과 이전 실패 이유는 `.log.previous-failure.reason`으로 보존했으며 삭제하지 않았다.
- 수동 구현 결과 위치: `~/.local/state/flownote-codex/runs/20261006T1139Z-feedback-implementation/`.
- 최종 큐 상태: inbox 0, processing 0, failed 0, done 3(사용자 피드백 작업 기준).
- 기존 알림기를 실행해 지정된 이메일로 변경 내용과 별도 검토 사항을 한 번 발송했다. `email-final.json`의 `sent=true`, 수신자 일치와 Gmail 메시지 식별자 확인. 알림 실행 종료 0. 메일 본문에는 원본 피드백·연락처·인증값을 넣지 않았다.

## 제한과 별도 검토 사항

제안은 브라우저의 규칙 기반 텍스트 처리이며 외부 AI로 내용을 보내지 않는다. 손글씨·이미지·PDF OCR은 포함하지 않는다. 여러 기기의 동시 일간 시간표 수정은 기존 전체 문서 저장 계약을 따른다.

별도 주간 리뷰 결과 5건은 사용자 피드백 실패 큐와 다른 검토 사항이다. 현재 소스에서 해당 패턴을 다시 확인했으나 이번 3건 구현에 포함해 수정하거나 동적 재현 검증하지 않았다. 추가 수정 범위를 사용자에게 질문했다.

1. critical: 노트의 결정적 객체 키를 충돌 검사 전에 기록하고 충돌 시 삭제하는 경로. `flownote-canvas/internal/notes/repo.go:124`, `:164`.
2. high: 공유방 삭제가 생성자 권한 대신 방 멤버 여부만 확인. `flownote-serve/internal/social/social.go:407`.
3. high: 작업·일정의 저장 객체를 SQL 성공 전에 덮어쓸 수 있음. `flownote-serve/internal/task/task.go:167`, `flownote-serve/internal/schedule/schedule.go:123`.
4. high: 게이트웨이가 요청 본문을 제한 없이 메모리에 적재. `flownote-API/app/gateway.py:134`.
5. medium: 일정 PATCH의 결과 상태 검증 누락과 기존 값 조건 때문에 빈 요일을 저장한 뒤 후속 수정이 막힐 수 있음. `flownote-serve/internal/schedule/schedule.go:226`.

이 기록은 사용자 피드백 원문·연락처·인증값을 포함하지 않는다. 제품 동작의 소유 문서는 [캔버스 플래너 제안](../../docs/product-specs/canvas-planner-suggestions.md), [웹 UX](../../docs/product-specs/web-workspace-ux.md)이다.
