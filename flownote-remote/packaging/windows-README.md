# Flownote Remote · Windows 시험판

`Flownote-Remote-<version>-windows-x64.exe`를 내려받아 실행하세요.
Windows x64용 단일 EXE이며 .NET 런타임·인식 모델·라이선스는 파일 안에 포함되어 있습니다.
카메라와 서버 인식에는 Microsoft WebView2 Evergreen Runtime이 필요합니다.

대시보드에서 **이 PC에서 서버 시작**을 누르고 **클라이언트 연결**에서 QR을 보여 주세요.
Android/Windows 클라이언트는 QR을 읽거나 연결 코드를 붙여넣고 서버를 확인해 등록합니다.
주소 직접 입력·제스처 설정·연결 기록은 `⋯` 메뉴에서 열 수 있습니다.
카메라 전송과 서버의 제스처 명령 허용을 각각 켜면 실제 손 모양으로 대상 기기의
시스템 음량·음소거를 제어합니다. 상태 경고는 화면과 OS TTS 음성으로 전달합니다.
음원 전송·분리/합성, 화면 배치·프로젝터, 대화형 AI는 아직 연결 전입니다.
연결·권한·제한은 소스의 docs/NETWORK.md를 참고하세요.

설정은 `%LOCALAPPDATA%/Flownote/Remote/settings.json`에 저장합니다.
앱 폴더를 옮겨도 설정은 유지됩니다. 자동 업데이트와 설치 프로그램은 없습니다.
배포 EXE에 Authenticode 서명은 없습니다.

배포 및 소스: https://github.com/lunce0503/flownote-remote-service
새 버전과 SHA256SUMS.txt는 위 저장소의 Releases에서 확인하세요.
릴리스 설명과 앱의 **오픈소스 라이선스**를 참고하세요.
