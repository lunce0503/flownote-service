# 클라우드 전용 전환과 그림판 컨트롤

- 완료일: 2026-09-09
- 범위: 전체 배포 체계, 웹, 모바일, Spring 모바일 설정, Canvas UI/입력
- 상세 보고서: `logs/report/2026-09-09-0027-cloud-only-staging.md`

## 완료 기준

- PC localhost/LAN 통신 및 Compose/Ollama 실행 경로 제거.
- 분리된 cloud staging을 먼저 검증하고 같은 source fingerprint만 production에 승격.
- 펜 버튼 팔레트, 아이콘 전용 저장 상태, 좌하단 고정 확대율/좌표 제공.
- 실제 cloud 저장·reload·Socket.IO·반응형 검증 통과.

## 결과

- staging/production Railway 전 서비스와 Vercel, mobile WAS, Expo Go 배포 성공.
- cloud Playwright 7/7, 웹/모바일 빌드, Spring/API/AI/Go 검증 성공.
- Railway 양 환경과 배포 번들에서 환경 교차 및 로컬 목적지가 없음을 확인했다.

## 의사결정

1. Railway private DNS는 cloud 내부 서비스 경계이므로 유지하고 클라이언트에는 공개 HTTPS만 허용한다.
2. URL 누락 시 staging fallback을 쓰지 않고 빌드/기동을 실패시켜 환경 교차를 막는다.
3. production 승격은 24시간 이내 동일 fingerprint staging receipt를 요구한다.
4. 최초 canvas load 중 포인터 입력을 잠가 원격 snapshot이 첫 획을 덮어쓰지 않게 한다.
5. 빠른 포인터 획은 React 렌더보다 즉시 갱신되는 ref로 완료 여부를 판정한다.

## 운영 참고

staging E2E 종료 시 관찰된 499는 브라우저가 페이지 전환 중 요청을 취소한 기록이며 5xx나 서버 처리 실패가 아니다. 로컬 Docker 통합 환경은 제거되어 cloud staging이 유일한 통합 검증 환경이다.
