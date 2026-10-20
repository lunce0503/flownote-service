# 접수 피드백 4건 구현·배포

## 범위와 기준

사용자가 2026-10-18에 접수 건의 배포까지 명시 승인했다. 10월 13일 접수·14일 수집한 4건은 과거 분석/후보 검증만 수행됐으며, 이번 작업 전 운영 배포 완료 영수증은 없었다. 원래 실패 입력·원인·후보를 보존하고 현재 앱 소스에 필요한 변경만 통합했다. 동시에 실행 중인 MVP 안정화 후보는 별도 snapshot 작업으로 이번 배포에 포함하지 않았다. 기존 계획 문서 변경은 되돌리지 않았다.

영향 서비스는 Vite 웹 `flownote/`다. 기존 API 계약을 사용하며 백엔드 소스·인증·DB migration·의존성·자동화 정책을 변경하지 않았다. 따라서 `release web`을 사용하고 Railway 앱 재배포는 생략한다. 신뢰 release 도구의 환경 URL/serverless 정책 확인은 기존 절차대로 수행한다. 로컬 앱/Compose/운영 테스트 데이터 작성은 하지 않는다.

## 반영 내용

| 접수 ID | 구현 |
| --- | --- |
| `627c30e4-f4c1-4e12-b96d-6d0f1ccb240c` | 설정 최대 폭 1024→1440px, 모바일 가용 폭, 지원하는 보기 설정의 시작 시 복원·탭 동기화·초기화, 접근 가능한 선택 상태. 동작과 연결되지 않은 삭제 전 확인 스위치 제거. |
| `b1671557-6470-476d-b16b-af4d42e77923` | 빠른 middle mouse/한 손가락 축 잠금/두 손가락 이동 뒤 최대 320ms 감속. 저속·정지·핀치·OS/앱 움직임 줄이기는 관성 제외. 새 입력·마우스 이탈·취소·숨김 시 정지. |
| `b789cfb3-c046-4ca7-a81d-d52df1370f34` | 캔버스 이름을 첫 후보로 해석하며 본문 중복 제외. 이름/본문의 날짜와 시간 구간은 확인 후 추가 시 기존 시간표에 자동 기입. 기존 일기·할 일·칸 보존, 충돌은 거부. |
| `f09662b1-7d96-4c8b-985c-3545e22d2e40` | PDF 한 페이지씩 앞뒤 이동하며 캔버스 동시 필기. 기기 메모리 전용·업로드 없음. 모바일 세로 상하/짧은 가로 좌우 분할, 실제 터치 스크롤, 연속 키보드 이동의 포커스 유지. |

기능 계획/TDD/UX 스킬에 따라 실패하는 캔버스 이름 테스트를 먼저 확인한 뒤 수정했고, 기존 cloud 제안 테스트는 요청된 새 순서와 저장 결과를 검증하도록 확장했다. 테스트를 생략/약화하지 않았다. 보안 검토는 로컬 PDF 크기·형식 제한, eval 비활성화, 외부 업로드 없음, 내용/자격증명 비노출을 확인했다. 배포 스킬은 staging-first·소스 동일성·rollback 기준 보존에 적용했다.

## 정적·단위 검증

- 관련 Node 단위 테스트 20/20 통과: 플래너 6, PDF 3, 관성 10, preference 1.
- `cd flownote && yarn lint`: 전체 통과. 처음 루트에서 실행한 `yarn lint`는 루트 script 부재로 실패해 올바른 하위 프로젝트에서 재실행했다.
- `cd flownote && yarn build`: 타입 검사·Vite 번들 통과. 기존 pdfjs eval/bundle 크기 경고는 남아 있으며 새 reader는 isEvalSupported=false로 연다.
- `git diff --check`: 통과.
- `yarn e2e --list`: 실제 staging 대상 30건 탐색. Android 3, Windows 1, 기존 cloud 15, 기존/확장 feedback 3, 관성 6, PDF 2.

## 클라우드 실행

실행 명령: `RAILWAY_AGENT_SESSION=flownote-feedback-deploy-20261018 node scripts/deploy-cloud.mjs release web`.

작업 시작 시 운영 rollback 기준은 `dpl_HdMhxeJ8aWSVxWRJe2A5vvCf6nq3`(2026-10-18T02:16:45Z READY). 사용자 요청 이외의 배포/DB 삭제/초기화는 하지 않는다.

최종 소스의 staging 배포 및 30건 E2E가 모두 통과했다(2026-10-18T02:42:54.925Z). 동일 소스 운영 배포와 smoke check도 2026-10-18T02:43:47.349Z에 완료했다. 자동화 설정만 변경한 결과가 아니라 접수 4건의 실제 앱 운영 반영이다.

첫 staging 실행에서 새 관성 6건은 통과했으나 PDF 2건은 실제 입력 canvas 테두리로 분할 영역이 2px 커지는 기존 intrinsic sizing 문제를 검출했다(데스크톱 경계 866 > 865, 모바일 하단 845.5 > 844). 테스트를 완화하지 않고 실제 canvas 장식/크기를 수정한 뒤 전체 cloud gate를 재실행한다. 실패한 실행은 운영 배포하지 않는다.

첫 cloud gate는 27/30 통과, 3건 실패로 종료됐다. 나머지 1건은 기존 축 잠금 E2E가 첫 이동의 관성이 끝나기 전 좌표를 읽고 두 번째 이동과 비교하는 시간 가정이었다. browser clock으로 각 입력 간 20ms, 손을 뗀 뒤 400ms를 진행해 감속까지 포함한 축 잠금을 검증하도록 확장했다. 움직임/수직축 보존 assertion은 모두 유지하며 skip/retry/오차 범위 확장은 없다.

재실행 결과:

- `cd flownote && yarn lint && yarn build`: 통과.
- 전체 cloud E2E 30/30 통과, retries=0. PDF 연속 키보드 이동·포커스·동시 필기 저장·기기 전용, 844×390 가로 화면 실제 PDF 영역/터치 스크롤, 원래 축 잠금과 신규 관성 6건 모두 포함한다.
- staging web `dpl_B16KTsLHmY1QFDooLCYwUQRrvYjq`, READY: <https://flownote-react-staging-6ge3mcls4-flownote-service.vercel.app>.
- 소스 SHA-256 `603fabbdbeb87b507760234104b47f50ef4f3ad16e8552d9c012e8f74a4ce99a`.
- 영수증 `.release/staging-web.json`. 첫 실패의 합성 데이터 스크린샷/오류 문맥은 `.release/feedback-first-gate-20261018T0239/`에 보존했다. 파일 소유권 때문에 move가 거부되어 원본을 지우지 않고 copy로 보존했다.
- 제품/기록 문서의 상대 링크 21개 존재 확인. 사용자가 수정 중이던 계획 파일은 변경하지 않았다.

운영 결과:

- production web `dpl_4655MEcEN1fCQUCoryq6YbDwzJtw`, READY: <https://flownote-react-5og6j6o4q-flownote-service.vercel.app>.
- 사용자 URL <https://flownote-react.vercel.app>.
- `.release/production-web.json`과 staging 영수증의 소스 지문이 동일하다.
- 운영 웹 HTML/CSS/JS·gateway `/` 200, 비인증 `/api/users/me` 401, `/api/mobile/config` 운영 URL 일치. 운영 사용자 문서를 쓰는 테스트는 하지 않았다.
- 원래 작업 트리 commit/push는 하지 않았다. 기존 automation 모델/프로필/24시간 timer와 별도 MVP snapshot은 변경하지 않았다.
- 결과 JSON: `~/.local/state/flownote-codex/runs/20261018T024347Z-received-feedback-release/final.json`.
- Vercel `inspect` read-back에서도 정확한 운영 ID와 `readyState=READY`를 확인했다.
- 4개 ID의 done 입력과 실패 입력이 같은 접수임을 확인한 뒤, done의 latest-result JSON을 실제 운영 영수증에 연결했다. 이전 failed 입력·reason·기술 리뷰 연결 파일은 `retry-history/manual-release-20261018T024347Z/`로 이동해 보존했다. 해당 failed 큐의 미처리 건은 0이며 원본 이력/DB/수집 cursor를 삭제하거나 초기화하지 않았다.
- 기존 `flownote-codex-notify`로 지정 수신자에게 결과 메일 1건 발송 완료. `email-final.json`의 `sent=true`, 수신자 일치와 Gmail message ID `1a14ce621a5f337e`를 확인했다. 알림 모델은 기존 `gpt-6.1-sol` 설정을 유지했다.
- 최종 독립 HTTP 재확인도 사용자 웹 200, gateway 200, 비인증 본인 조회 401이었다. 큐 4건 완료 연결·실패 이력 보존·메일 발송을 다시 검증했다.

## 제한과 소유 문서

시간표 자동 기입은 사용자가 제안 추가를 확인한 시점이며 아무 확인 없이 개인 일정을 쓰지 않는다. 지원 시간 표기는 기존 HH:mm 구간이고 손글씨/OCR은 포함하지 않는다. PDF는 닫으면 다시 선택해야 하며 기기 전용이다. 여러 기기의 diary 동시 수정은 기존 전체 문서 저장 계약의 한계가 남는다.

- [웹 작업 공간 UX](../../docs/product-specs/web-workspace-ux.md)
- [플래너 제안](../../docs/product-specs/canvas-planner-suggestions.md)
- [PDF 책 읽기](../../docs/product-specs/canvas-pdf-reader.md)
- [후보 회귀 기록](../bugs/2026-10-18-feedback-candidate-regressions.md)
