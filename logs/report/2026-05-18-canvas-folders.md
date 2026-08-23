# 2026-05-18 캔버스 폴더 및 다중 문서 작업 기록

## 범위

- 기존 사용자당 단일 캔버스를 사용자당 여러 캔버스 문서 구조로 확장했다.
- `canvas_documents`에 `id`, `title`을 추가하고 기존 데이터는 `기본 캔버스`로 유지되도록 마이그레이션했다.
- `canvas_folders` 테이블과 폴더별 `canvas_ids` 배열을 추가했다.
- Spring API에 캔버스 문서 생성, 수정, 삭제, 목록 조회와 폴더 생성, 수정, 삭제, 문서 이동 API를 추가했다.
- React 캔버스 화면에 게시글 탭과 유사한 폴더 사이드바를 추가했다.
- 선택한 캔버스 ID 기준으로 저장과 불러오기를 수행하도록 캔버스 persistence를 변경했다.

## 검증

- `flownote-server/`: `./gradlew --no-daemon --project-cache-dir /tmp/flownote-gradle-project-cache -Dorg.gradle.project.buildDir=/tmp/flownote-server-build test` 성공.
- `flownote/`: `yarn build` 성공.
- 저장소 루트: `docker compose up -d --build` 성공.
- `docker compose ps` 기준 전체 서비스가 `Up` 상태다.

## 주의

- 기존 캔버스 데이터는 마이그레이션 후 첫 문서로 보존된다.
- 캔버스 폴더 이동은 게시글 폴더처럼 드래그 앤 드롭으로 동작한다.
