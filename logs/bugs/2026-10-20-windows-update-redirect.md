# Windows update GitHub redirect cancellation

- 증상: 실제 Windows 1.1.0 packaged main process에서 signed staging feed를 검증한 뒤 EXE 다운로드 시 `Redirect was cancelled`가 발생했다. runner `39366187676`에서 확인했다.
- 원인: Electron `net.fetch(..., {redirect:'manual'})`가 GitHub release CDN의 302를 Response로 반환하지 않고 취소해 core의 redirect allow-list 검사 전에 실패했다. mock/Node fetch 테스트나 현재 버전 feed 검사로는 드러나지 않았다.
- 수정: updater의 기존 Node fetch 기본 transport를 사용한다. 고정 HTTPS URL, 수동 redirect 검사, allow-list, 최대 redirect 횟수와 서명/해시 검증은 유지한다. 임의 URL/프로토콜 fallback이나 renderer bridge는 추가하지 않는다.
- 릴리스: 이미 공개된 1.1.0 artifact는 덮어쓰지 않고 Windows 1.1.1로 수정 배포한다. 1.0.0 및 초기 1.1.0 사용자는 수정 버전을 직접 설치해야 한다. production feed는 검증 통과 전 승격하지 않는다.
- 검증: 동일한 실제 packaged Node fetch transport로 GitHub의 최종 EXE/ZIP을 내려받아 서명·해시·캐시 재사용·현재 버전 skip을 Windows runner에서 재검증한다.
