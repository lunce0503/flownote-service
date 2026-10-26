# 작업 공간·캔버스·책장 UX 및 클라우드 연결

상태: 2026-10-26 완료. 여섯 요구사항 구현·staging 107/107·같은 소스 main/canvas/api/web production 배포 및 기존 앱 반영 검증을 완료했다. [최종 앱 릴리스 기록](../../../logs/report/2026-10-26-2049-workspace-library-app-release.md)에 ID·지문·앱 채널과 실기기 한계를 남겼다.

## 완료 기준

1. 캔버스 저장 상태는 배경·그림자 없는 회색 표시. 저장 대기/저장 중은 저장 중 형태, 완료는 원 테두리 없는 단순 회색 체크. 오류·접근성 안내와 실제 저장 동작 보존.
2. Android/iOS의 펜 접촉 필기 중 위치 커서를 숨긴다. 호버는 지원 기기에서 유지하고, 지우개는 더 큰 원으로 표시한다. 두 번 탭·손가락 이동·핀치·저장 회귀 검증.
3. 계정별 PDF 원본·표지·제목/분야·읽기 위치·책갈피를 클라우드에 보관해 새 기기에서 연다. 기존 기기 책은 보존·이관하고 OFF 중 네트워크 전송을 막으며 ON 시 재시도한다. 100MiB 업로드/내보내기 유지. 읽기 제어 접기와 세로 점 세 개 세부 수정. PDF 텍스트 선택→사전 검색→책/페이지를 포함한 검색 기록 저장 및 기기 간 조회. 스캔 PDF의 텍스트 부재를 명시한다.
4. 노트와 캔버스를 같은 목록에서 검색·정렬·열기·생성한다. 기존 URL·폴더·자료를 유지하고 파일 종류를 구분한다.
5. 노트를 편집하면 Markdown 서식이 곧바로 렌더링된다. 수식·GFM·한글 IME·기기 초안·저장 재시도·충돌/원본 보존을 검증한다. 단순 수동 미리보기 토글만으로 완료하지 않는다.
6. 캔버스 도구막대 및 모바일 파일 메뉴의 전체 화면/전체 보기 버튼 제거.

## 구현 경계와 순서

- `flownote/`: 캔버스 Toolbar/ToolPointer, 공통 목록, Markdown 편집기, 책장 동기화/텍스트층/사전 UI.
- `flownote-canvas/`: 기존 인증·PostgreSQL·S3 패턴을 사용하는 library 도메인. 계정 소유권을 모든 원본·메타데이터·사전 기록 요청에서 검사한다. 대용량 PDF는 작은 청크로 올려 gateway/Vercel 제한과 서버 메모리를 제한한다.
- `flownote-server/`: 기존 Flyway 소유권을 따라 새 library 테이블 migration. 기존 migration 변경 금지.
- `flownote-API/`: library 경로를 canvas 서비스로 연결한다. 큰 요청의 무제한 버퍼링을 피하고 고정 사전 공급자만 사용한다.
- 네이티브 셸/권한은 필요성 확인 후 수정. 앱 배포는 기존 application manage 세션이 소유한다.

우선 캔버스의 작은 표시 변경과 회귀 검사를 완료하고, 책장 API/동기화 및 선택·사전 기능, 공통 목록, 실시간 Markdown 편집 순서로 구현한다. 실행 상태와 실제 검증 결과를 이 문서에 갱신한다.

## 데이터·보안 계약

- PDF 100MiB 상한, 고정 크기 청크·순서/해시/파일 헤더 검사, 원본 비공개 인증 조회. 소유자 ID를 요청 본문에서 신뢰하지 않는다.
- 서버 revision과 로컬 변경 세대를 대조해 늦은 응답이 새 편집을 지우지 않게 한다. 업로드 실패 시 기기 원본/메타데이터를 유지하고 명시적으로 재시도한다. 삭제는 다른 기기에서 재등장하지 않게 처리한다.
- 동기화 OFF에서는 저장된 기기 원본을 읽고 네트워크 업로드/수신을 중지한다. 계정 변경 뒤 비동기 완료가 다른 계정 저장소에 반영되지 않게 한다.
- 사전 조회는 선택한 짧은 텍스트만 고정 HTTPS 공급자로 전송한다. 정의·출처는 텍스트로 안전하게 렌더링하고 전체 PDF를 외부에 전송하지 않는다.

## 검증·배포

의미 있는 도메인/계약 단위 검증 → 프런트 `yarn verify` → Go `go test ./...` 및 API `uv run pytest` → Spring `./gradlew test` → 스테이징 실제 교차 기기·소유권/삭제·100MiB·모바일/WebKit·저장/IME E2E → 동일 소스 production. 서버 변경은 main/canvas/api/web 배포 대상을 함께 지정한다. 앱 관리 인계 후 실제 배포 ID·앱 반영 결과를 logs/report에 기록한다. 테스트·구현만 된 부분을 배포 완료로 표시하지 않는다.

## 진행 기록

- 작업 시작 시 코드: 책장은 계정별 IndexedDB 저장만 사용했다. PDF는 canvas만 렌더링하며 선택 가능한 텍스트층이 없었다. 노트는 기본 raw textarea와 수동 preview/split을 사용했고 두 목록·진입점이 분리돼 있었다.

- 캔버스 표시/커서/전체 화면 제거, library API와 Flyway V22, 기기 저장 v2 및 클라우드 동기화, 텍스트층·사전/단어장, 공통 파일 목록과 기본 실시간 Markdown 편집을 구현했다. 아직 실제 클라우드 통과·운영 반영 증거는 없다.
- 프런트 모델 80/80, API 31/31, Spring Gradle test, Go 전체 패키지 검사가 통과했다. 최종 수정 후 프런트/Go 재검증을 이어간다.
- 새 E2E는 사전·소유권·100MiB 원본 비교·새 기기의 읽기/단어장·실제 브라우저 드래그·실시간 Markdown·IME·공통 목록·회색 상태 아이콘 및 32px 지우개를 추가한다. 기존 원문 보존 검사는 명시적 원문 모드로 유지한다. 테스트 등록만으로 기능 통과로 표시하지 않는다.
- Railway 인증을 현재 환경에서 확인했다. release library의 실제 staging/production 및 앱 관리 인계는 다음 실행 단계다.

- 부모 최종 리뷰에서 완료 업로드 receipt가 진행 중 4개 제한을 소비하는 오류를 발견했다. library repo count에서 완료된 소유자 일치 receipt를 제외하고 library-upload-cap.spec.ts를 추가했다. 앱 관리 실행 중 의존성 설치 단계에서 양쪽 소스에 같은 좁은 수정을 반영했으며 신규 backend/전체 gate 검증 대상이다. 상세 원인은 [버그 기록](../../../logs/bugs/2026-10-26-library-completed-upload-cap.md)에 남겼다. 이전 책장 웹 결과 보고서의 끊어진 상대 링크도 해당 historical 보고서를 추가해 복원했다.

- 최종 소스 `0c8f5ac`: 완료 업로드 quota, OFF/ON 교차기기 E2E, PDF 백업 안내, 체크리스트 뒤 Markdown 재로드와 저장 실패 알림을 보완했다. 모델 81/81, 웹 verify, lazy bundle, Go/API/Spring 검사 및 전체 staging 107/107 통과. V22는 staging/production Flyway 이력에서 success=true를 직접 조회했다.
- 2026-10-26 21:20 Asia/Seoul 운영 main/canvas/api/web 배포·smoke 완료. receipt 지문 `e865ae8000d28005c7f8bcdd3908310f901bb5ebcb06950dcaaaf8b7f609e6a6`. Windows 공개 설치형/포터블과 Android 기존 설치본의 새 staging entry 해시·재시작 보존 확인, iOS 1.3.0(8) TestFlight VALID/IN_BETA_TESTING 재확인. 물리 iPad/Pencil 동작은 미연결로 남는다.
