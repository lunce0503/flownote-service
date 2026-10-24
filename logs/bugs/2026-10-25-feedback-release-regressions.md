# 피드백 복구 릴리스 클라우드 회귀

- 첫 전체 gate: 91/97 통과, 6건 실패. production 배포는 차단됐다.
- 모바일 파일 메뉴: 플래너 제안 패널이 열린 상태에서 파일 메뉴가 낮은 stacking context에 있어 메뉴 항목이 패널에 가려졌다. 파일 메뉴가 열릴 때만 Toolbar 층을 80으로 올려 실제 클릭 경로를 복구한다. 강제 클릭으로 우회하지 않는다.
- WebKit hover 좌표 검사: 이미 보이는 포인터의 다음 requestAnimationFrame 위치가 반영되기 전에 boundingBox를 읽어 직전 좌표를 얻었다. 두 프레임 후 같은 좌표·같은 허용 오차로 검사한다. 실제 CDP 접촉 6건 검증은 유지한다.
- NEW clock 검사: 24시간치 타이머/프레임을 통째로 재생하며 타임아웃이 나고 finally logout이 원래 실패를 가렸다. 현재 시각 근처에서 pause 후 wall clock만 정확히 24시간 경계 직전으로 이동하고 focus로 갱신한다. 2초 진행으로 만료를 검사하고 reload 전 clock을 resume한다. 실제 서버 접수·1초 전 표시·만료 뒤 숨김·원본 DB 불변 조건을 유지한다.
- 설치본 보조 검사: WebView의 일반 context 쿠키 초기화 미지원은 CDP 명령으로 처리한다. Electron HTTP 304는 body가 없으므로 실행 entry URL과 브라우저 캐시 바이트의 SHA-256, 실제 신규 포인터 동작을 함께 검사한다. reload 후에는 저장 상태 ready와 포인터 mount를 기다린다.
- 최종 재검증·배포 결과는 연결된 릴리스 보고서에 기록한다. 사용자 자료나 자격 증명은 기록하지 않는다.
