# Android updater missing Settings activity

- 증상: Android 15 Google ATD 에뮬레이터에서 ‘설정 열기’를 누르면 `ActivityNotFoundException`으로 앱이 종료됐다.
- 원인: ATD는 시스템 Settings 화면을 생략한다. AlertDialog의 나중에 실행되는 클릭 callback 안의 startActivity 예외가 외부 try/catch 밖에서 발생했다.
- 수정: callback 내부에서 예외를 처리하고 기기 설정에서 설치 허용을 확인하라는 native 상태를 표시한다. 일반 기기의 Settings intent와 명시적 설치 승인 정책은 유지한다.
- 검증: 빌드/lint 후 ATD에서 미제공 Settings 화면은 별도 미검증으로 기록한다. 테스트 전용 app-op으로 권한을 부여한 뒤 실제 OS installer, 버전 상승, 로그인/초안 보존을 검증한다. 실기기 Settings 스위치 조작은 현장 확인 대상이다.
