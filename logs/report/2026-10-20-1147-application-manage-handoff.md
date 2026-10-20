# Windows·Android 앱 빌드와 자동 업데이트 인계

작성: 2026-10-20 11:47 KST (Asia/Seoul). 사용자 요청에 따라 웹 배포 후 application manage 세션으로 후속 작업을 전달한다. 현재 상태: application manage 메시지 전달 성공. 앱 빌드/업데이트 구현 완료를 의미하지 않는다.

## 인계 대상과 범위

- 세션 별칭: application manage. 실제 task ID: `01a04858-b6df-7613-91da-c92a37955657`. 같은 Flownote 작업 공간의 앱 관리 세션이며 로컬 세션 색인에서 별칭/ID를 확인했다.
- 범위는 Windows(`flownote-desktop/`)와 Android(`flownote-android/`)다. iOS·macOS·Linux·Expo/Remote 앱은 확장하지 않는다.
- 최신 웹 디자인을 반영한 실제 배포용 앱 빌드·서명·검증·배포와 다운로드 링크를 완료한다. 버전/기존 릴리스/서명키/업데이트 채널은 현재 사실을 먼저 확인하고 기존 사용자 프로필·세션·초안·문서를 보존한다.
- 앱 시작/재개 시 및 적절한 주기로 새 릴리스를 확인하고, 설치 버전보다 높은 버전만 자동 다운로드한다. 변경 이력/진행/실패·재시도 상태를 구분하고 같은 버전 재다운로드나 downgrade를 막는다. Windows 설치형/portable의 업데이트 가능 범위를 구분하고, Android는 플랫폼 설치 확인 절차와 자동 다운로드를 구분한다.
- 업데이트 feed와 산출물의 HTTPS origin·서명·무결성을 확인하고 origin 고정/sandbox/JS bridge 금지 등 기존 보안 경계를 유지한다. 비밀값·서명키를 코드나 보고서에 넣지 않는다.

## 완료된 웹 기준

[캔버스·노트 디자인 배포 보고서](2026-10-20-1144-canvas-note-workspace-design.md).

- 운영: https://flownote-react.vercel.app
- web deployment: `dpl_DqBeD3emQRNMfxLLy5cWFtEvTqEu`, READY.
- source fingerprint: `3f4e3bfff9fef89d4e55e781739fe939834dd80fea3040c23e53d52153f872f5`.
- staging 전체 E2E52/52 및 실제 UI 검토 후 동일 소스 운영 배포·health/read-back 완료.
- 공유 작업 트리의 기존 인증·Canvas/PDF·Markdown 등 미커밋 변경을 보존해야 한다. Git HEAD만 새로 checkout하면 현재 배포된 변경이 빠질 수 있다.

## 검증과 산출물

Windows는 기존 Windows runner에서 실제 설치한 EXE/portable의 staging smoke와 최종 배포 artifact를 연결한다. Android는 빌드·lint·서명·버전·업데이트 다운로드/설치 전달을 검사한다. 실제 기기/OS 검증을 못 한 경우 통과했다고 기록하지 않는다. 앱 업데이트가 필요한 웹/API 변경은 기존 staging-first 동일 소스 배포 절차를 따른다.

최종 보고에는 Windows/Android 각각 버전, 빌드/검증 결과, 다운로드 URL, checksum/서명 확인, 자동 업데이트 feed와 현재 지원 범위, 실제 OS 설치 확인이 필요한 단계를 기록한다. 이 인계 문서만 작성한 현재 세션은 실행 산출물을 바꾸지 않으므로 Docker/클라우드 재배포를 생략한다.


## 전송 확인

사용자가 명시한 application manage task에 후속 prompt를 전송했고 도구가 동일 task ID와 isError=false를 반환했다. Windows/Android 빌드·배포·신규 버전 자동 다운로드·검증·최종 사용자 보고를 해당 세션이 수행하도록 전달했다. 현재 세션에서는 앱 빌드 완료를 선언하지 않는다.
