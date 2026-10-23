# Flownote Remote · Windows 시험판

ZIP 파일의 내용을 모두 같은 폴더에 풀고 `Flownote.Remote.exe`를 실행하세요.
Windows x64용이며 .NET 런타임은 포함되어 있습니다.

현재는 제스처별 동작, 신뢰도·유지 시간·재실행 간격, 카메라 방향, 음량·EQ
설정을 저장하고 합성 입력으로 실행 후보를 확인하는 초기 앱입니다.
카메라 인식·실제 소리 출력/시스템 음량·비서 실행·기기 간 연결은 제공하지 않습니다.

설정은 `%LOCALAPPDATA%/Flownote/Remote/settings.json`에 저장합니다.
앱 폴더를 옮겨도 설정은 유지됩니다. 자동 업데이트와 설치 프로그램은 없습니다.
배포 EXE에 Authenticode 서명은 없습니다.

배포 및 소스: https://github.com/lunce0503/flownote-remote-service
새 버전과 SHA256SUMS.txt는 위 저장소의 Releases에서 확인하세요.
포함된 `RELEASE_NOTES.md`, `THIRD-PARTY-NOTICES.md`와 `licenses/`를 참고하세요.
