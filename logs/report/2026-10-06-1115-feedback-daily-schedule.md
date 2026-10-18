# 피드백 수집 24시간 주기 적용

- 요청: 사용자 피드백 수집 주기를 24시간으로 변경.
- 영향 범위: feedback systemd timer, 자동화 안내서, 피드백 제품 명세와 운영 문서.
- 저장소 timer와 설치된 user timer의 `OnCalendar`를 `*-*-* 00:00:00 UTC`로 변경. 매일 00:00 UTC(한국 시각 09:00)에 수집하며 기존 최대 15초 무작위 지연과 `Persistent=true`는 유지.
- `systemctl --user daemon-reload`와 feedback timer restart로 적용. 현재 enabled/active 확인.
- `systemd-analyze calendar --iterations=2`에서 10월 7일과 8일 00:00 UTC를 확인하여 24시간 간격 검증.
- 다음 실제 예약 시각: 2026-10-07 00:00:08 UTC. timer 소스와 설치본 `cmp` 통과.
- cursor와 실패 큐, 주간 리뷰 정책은 변경하지 않음. 새 피드백은 다음 수집까지 최대 약 24시간 대기할 수 있으며 분석 시간이 추가됨.
- 클라우드 배포 생략: 이 서버의 systemd 예약 설정 변경으로 Vercel/Railway 실행 산출물에 영향 없음. 필요한 클라우드 배포 명령 없음.
