# Workspace API v1

Host 0.4.0 / Android 0.3.0. 기존 터미널 WSS v1과 QR 등록 계약은 유지한다. 파일 API는 같은 인증서·포트의 HTTPS에서 기기 Bearer 토큰을 검증한다. 폐기된 기기는 거부하며 토큰/내용을 로그에 넣지 않는다. 브라우저 Origin 요청은 거부한다.

프로젝트 루트는 Host 설정 `cwd`의 시작 시 realpath다. 클라이언트는 `/` 구분 상대 경로만 전송한다. 빈 경로는 목록의 루트에만 허용한다. 절대 경로·빈 구성요소·`.`·`..`·역슬래시·콜론/제어 문자·심볼릭 링크를 거부한다. 일반 파일만 읽고 hard link(nlink != 1), 바이너리/NUL, UTF-8 아닌 내용과 256 KiB 초과 파일은 거부한다. `.env*`, 인증 키/키스토어/일반 credentials 이름과 `.git`, `.ssh`, `.config`, `node_modules`, 빌드/캐시 폴더 등은 목록/직접 접근 모두 차단한다. 명시적 프로젝트 설정을 돕는 제한이지, 이미 전체 셸 권한을 가진 OS 사용자에 대한 보안 sandbox는 아니다.

각 요청은 `POST /v1/workspace/<operation>`, JSON, Authorization 헤더만 사용한다. 본문 최대 2 MiB, 수신 15초 제한. 응답은 JSON/`Cache-Control: no-store`/`nosniff`, 성공에 `version:1`을 포함한다. 요청의 미지 필드는 거부한다.

| operation | 요청 | 성공 응답 |
| --- | --- | --- |
| list | `{path:string, offset?:integer}` | `{version:1, rootName, path, entries:[{name,path,kind:"file"|"directory"}], nextOffset:integer|null}` |
| read | `{path:string}` | `{version:1,path,content,revision,mode}` |
| write | `{path:string,content:string,revision:64자리 SHA-256}` | `{version:1,path,revision}` |

목록은 디렉터리 우선·이름 순, 페이지당 200개, 폴더 스캔 최대 5000개다. 전체 트리를 재귀 스캔하지 않는다. revision은 읽은 원본 UTF-8 bytes의 SHA-256이다. write는 기존 파일만 수정하고 생성/삭제/이름 변경은 제공하지 않는다. 이전 revision이 다르면 409로 거부한다. 저장 작업은 Host 내에서 직렬화하며 임시 파일 sync 후 원자적 rename하고 기존 mode를 유지한다. 교체 직전 경로·revision을 재확인한다. 협조하지 않는 다른 OS 프로세스의 check/rename 사이 극히 짧은 변경을 완전 원자적 비교·교환으로 보장하지는 않는다.

- 400: JSON/필드 위반. 401: 인증 실패. 403: 경로/파일/출처 차단.
- 404: 파일 없음 또는 이전 Host에서 지원하지 않는 endpoint.
- 409: PC 변경 충돌, 자동 덮어쓰기/자동 재전송 금지.
- 413: 요청/파일/폴더 크기 한도. 415: UTF-8 텍스트가 아님. 429: 인증 제한. 500: 일반 파일 오류.

앱은 CodeMirror 6을 APK에 번들하고 NativeEditor에는 경로·내용·명령만 전달한다. 기기 토큰은 JS에 주지 않는다. 브리지는 고정 appassets main-frame 출처만 허용하며 epoch를 PC별로 바꿔 초안/undo가 다른 PC로 넘어가지 않도록 한다. 탭 최대 8개, 초안은 메모리에만 유지한다. 미저장 탭 닫기/다시 불러오기/PC 떠나기는 버리기 확인이 필요하다. 앱 프로세스 강제 종료 후 초안 영속 복원은 제공하지 않는다.
