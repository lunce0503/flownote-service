# 원격 앱 폴더명 정정

- 사용자 요청에 따라 원격 앱 폴더를 `flownote-remote/`로 이동한다. 소스·설정·기존 빌드 파일을 보존한다.
- GitHub Actions 경로 필터, 작업 디렉터리, .NET SDK 설정 경로와 README·제품 사양·아키텍처·이전 기록의 현재 경로를 함께 정정한다.
- 검증: 새 경로 존재/이전 경로 부재, 활성 경로 참조·문서 상대 링크, `git diff --check`, 새 디렉터리의 기존 Android 및 .NET 검사로 확인한다.
- 앱 동작·웹/백엔드 실행 산출물·배포 자산은 바뀌지 않아 cloud 배포는 생략한다. 추후 서명 바이너리·다운로드 자산 준비 후 필요한 배포 명령은 저장소 루트의 `node scripts/deploy-cloud.mjs release web`이다.
