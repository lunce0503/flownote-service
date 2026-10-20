# Blog 목록 지연과 Markdown 보존 위험

## 증상·재현 근거

변경 전 Go `notes.Repo.List`는 사용자 노트 N개를 조회한 뒤 `resolveContent`로 N개의 object storage 본문을 순차 읽는다. 웹 편집기도 전체 목록에서 선택 노트를 찾았다. 공급된 합성 staging 관측은 노트 5개, Canvas 5개의 목록을 교대로 5회 측정한 값이다: notes 800/814/954/1060/1062ms, median 954ms, 33,348 bytes; Canvas 129/138/201/202/269ms, median 201ms, 770 bytes. 브라우저 전체 로딩·production·개선 후 수치가 아니다. 최초 계정 POST 502 뒤 warm 실행은 성공했고 최초 502의 원인은 확정하지 않는다.

작업 중 production bundle의 정적 import 그래프 테스트를 먼저 실패시켰다: `MarkdownWorkspace → vendor-react → editor-blocknote/prosemirror/yjs`. 원인은 `manualChunks`의 `/react/` 조건이 `@blocknote/react`도 포함하고, 의존성을 vendor에 자동 편입하는 설정이었다. 정확한 package-root 분기와 explicit chunk 설정 후 같은 테스트가 통과했다. 이는 빌드 산출물의 import 근거이며 실제 브라우저 시간은 아직 측정하지 않았다. 인증 bootstrap/콜드스타트 지연 가설은 별도 미검증 상태다.

변경 전 초안은 편집기 메모리/타이머에 의존하고 서버에는 Markdown 형식 검증이 없었다. 새 변환 테스트는 모듈 구현 전 실패했고 이후 통과했다. 실제 legacy downgrade·storage count의 Go 재현 테스트도 작성했지만 Go 도구 부재로 실행하지 않았다. 운영 사용자 데이터 유실을 재현했다고 주장하지 않는다.

## 수정 방향과 후보 구현

summary는 본문을 선택/읽지 않는 SQL, detail은 소유권 확인 뒤 단일 body Get이다. 기본 전체 목록은 호환 경로로 남는다. 본문 장애는 해당 detail에서 502로 나타나며 빈 문서로 저장하지 않는다.

새 Markdown은 format/version 객체이며 기존 JSONB에 작은 format 표식을 둔다. 원자적 revision/format 조건으로 legacy 배열 downgrade를 거부한다. 전환 시 서버 원본을 백업하고 이후 client backup 교체를 무시한다. 재사용 revision/client로 다른 입력을 ack하지 않는다. 본문 hash가 포함된 별도 object key로 동시 요청이 승자 본문을 먼저 바꾸는 위험도 피한다.

IndexedDB 초안은 입력 때 기록하고, sequence 비교 ack와 기준 revision rebase로 저장 A가 최신 입력 B를 지우지 않는다. 화면 이동 시 예약 저장을 멈추되 초안·진행 중 ack를 보존한다. 저장소 실패·충돌·계정 분리는 순수 테스트로 확인하고 cloud E2E를 추가했다.

## 상태

웹 lint/typecheck/build(runner 설정 로더)와 Node 테스트는 로컬에서 실행했다. 기본 `yarn verify`는 읽기 전용 `.vite-temp` 때문에 실패했다. Go·Flyway·실제 staging·화면 폭/기기·출시 검증과 사후 API 측정은 대기다. 세부 명령은 [활성 실행 계획](../../docs/exec-plan/completed/2026-10-19-blog-markdown-workspace.md)을 따른다.

후보 저장 큐 리뷰 중 `ack A`가 기기 용량 오류로 저장되지 못한 최신 `B`를 “기기에 보관됨”으로 잘못 표시하는 상황을 새 순수 테스트로 재현했다(실패 확인). 실패 sequence를 추적해 이전 ack가 해당 경고를 지우지 못하게 수정한 뒤 같은 테스트가 통과했다. 이는 개발 중 후보에서 재현·수정한 오류이며 운영 장애 주장이 아니다. body GET 실패 때도 사용자별 기기 초안의 JSON/.md 내보내기를 제공하고 편집 가능한 빈 본문으로 대체하지 않는다.


## 해결 확인

2026-10-19: 신뢰 host의 Go/웹/소비자 검증, staging E2E47개와 동일 소스 운영 배포 완료. 목록180ms/892 bytes(Canvas182ms), 같은 서버의 전체 목록594ms/31,242 bytes. 브라우저 전체/운영 측정은 아니다. 상세: [최종 보고서](../report/2026-10-19-1438-blog-markdown-release.md). 위 미실행·대기 문구는 후보 단계의 이력이다.
