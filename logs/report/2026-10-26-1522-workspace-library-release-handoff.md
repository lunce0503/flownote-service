# 작업 공간·캔버스·책장 기능 배포 후보

상태 정정: 2026-10-26 앱 관리 세션에서 전체 staging 107/107·같은 소스 production main/canvas/api/web 배포·기존 앱 반영 검증을 완료했다. 이 문서의 아래 내용은 최초 인계 시점 기록이며, 최종 ID·지문·수정과 제한은 [완료 기록](2026-10-26-2049-workspace-library-app-release.md)을 따른다.

## 범위

[실행 계획](../../docs/exec-plan/active/2026-10-26-workspace-library-ux.md)의 여섯 요구사항을 전체 유지한다. 회색 저장 상태, 모바일 필기 중 커서 숨김과 32px 지우개, 책장 원본/메타/단어장의 클라우드 연결과 텍스트 선택 사전·제어 자동 접기·세부 수정, 노트/캔버스 통합 목록, 기본 실시간 Markdown 편집, 전체 화면 버튼 제거를 포함한다. 이전 운영의 4px 호버·이름/아이콘 제거도 유지한다.

공유 작업 트리의 다른 변경을 포함하지 않도록 운영 기반 5400b6d에서 /tmp/flownote-workspace-library-20261026, codex/workspace-library-20261026을 만들고 해당 변경만 복사했다. 앱 배포는 기존 application manage(01a04858-b6df-7613-91da-c92a37955657)에 인계한다. 네이티브 변경이 없으면 기존 설치본의 공통 웹 반영을 검증하고 새 바이너리 출시로 표시하지 않는다.

## 검증 증거

- 프런트 yarn verify: lint, typecheck, production build 통과. 실행 로그 /tmp/flownote-workspace-library-web-verify.log.
- 프런트 모델 node --test: 80/80 통과(이전 동일 기능 검증). 빌드 뒤 tests/blog-bundle.test.mjs: 1/1 통과. 통합 목록 도입으로 빌드 청크 이름이 달라져 이전 고정 청크 이름 검사를 공개 workspace 표면 기준으로 정정했다. live/preview/legacy 편집기 정적 로딩 방지 검사는 유지한다.
- Go gofmt + Docker golang:1.23 go test ./...: 전체 패키지 통과. /tmp/flownote-workspace-library-go-verify.log.
- API uv run pytest: 31/31, Spring ./gradlew test: BUILD SUCCESSFUL. 신규 V22 SQL의 실제 Flyway 적용 증거는 아직 없다.
- Playwright --list: 105개/23파일 등록 확인. 등록은 실행 통과 증거가 아니다.
- node --check scripts/deploy-cloud.mjs, bash -n scripts/verify-services.sh, git diff --check 통과.

## 배포·앱 관리 완료 기준

node scripts/deploy-cloud.mjs release library로 main(Flyway V22) → canvas → api → web을 staging-first로 배포한다. 전체 클라우드 105개와 신규 요구사항 실제 동작, 100MiB 원본 SHA-256, 두 기기 메타/단어장/삭제, 소유권/화면-서버 계정 불일치, OFF/ON, 사전 실제 공급자 응답, IME/원문 보존 및 네이티브 설치본을 검증한 뒤 동일 소스를 운영 승격한다. 실패 시 기능을 축소하거나 실패 검사를 삭제하지 않고 원인을 수정하고 다시 검증한다. 최종 deployment IDs·소스 지문·배포 채널·실물 기기 미검증을 별도 완료 기록에 남긴다. Railway 인증은 현재 환경에서 확인했다. 물리 iPad/Pencil은 연결돼 있지 않다.

서버 변경이 있으므로 backend 배포를 생략하지 않는다. 기능 배포가 진행 중이며 이 보고서 자체만 바뀌는 경우는 추가 빌드/배포 대상이 아니다.
