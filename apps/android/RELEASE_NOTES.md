# Flownote Remote Android 0.1.0

Android 10 이상에서 Remote Host 0.2.0을 실행 중인 Linux/Windows PC의 실제 터미널에 연결하는 앱입니다.

- PC 수동 등록 또는 Host 초기화 JSON 가져오기
- SHA-256 인증서 지문 검증과 Keystore 암호화 토큰 저장
- xterm.js ANSI 터미널, 한글 명령 입력창, 제어키와 붙여넣기 확인
- 화면 회전·키보드에 맞춘 PTY 크기 변경
- 일시 단절 재접속, 출력 복원 한계 안내, 세션 종료

`flownote-remote-v0.1.0.apk`를 설치한 뒤 PC의 WSS 주소, 기기 토큰과 인증서 지문을 등록하세요. Host와 Android가 같은 LAN 또는 기존 VPN에 있어야 합니다. Android는 명령을 전송하고 실제 실행은 PC 사용자 권한으로 이루어집니다.

앱은 원격 터미널을 제공합니다. 데스크톱 그래픽 화면·마우스 제어, 인터넷 릴레이와 지속적인 백그라운드 연결은 포함하지 않습니다.
