# 노트 생성·편집·수식과 Android 업데이트 설정

상태: 구현·staging/native 검증 진행, 운영 승격 보류. 운영 기준 058828a / dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55는 유지됐다. 최신 진단 전체128은123통과/5실패(모두 사전)이며 전체 목표는 미완료다. 정책/검사 도구 변경 후의 최종 matching gate는 아직 없다. 이전 읽기 기능의116개 통과 기록을 이번 완료 증거로 사용하지 않는다. [현재 증거·차단점·재개 절차](../../../logs/report/2026-10-29-1512-staging-api-warm-release-blocked.md)를 따른다.

2026-10-29 최신 범위: 사용자가 사전 기능을 보류하고 다른 기능을 배포하라고 명시했다. 사전 복구/충전은 이번 릴리스의 선행 조건에서 제외하며 [사전 보류 릴리스 계획](2026-10-29-dictionary-suspension-release.md)의 외부 호출0·단어장 보존 계약으로 새 전체129개 gate를 수행한다. 기존123/5는 이전 계약 진단이며 새 성공 기록이 아니다.

## 사용자 요구와 완료 기준

1. 통합 목록과 노트 편집 화면 모두 새 노트를 만들 수 있다. 네이티브에서 지원되지 않는 window.prompt에 의존하지 않는다. 연속 클릭 중 중복 생성을 막고 선택 폴더를 유지한다. 폴더 배치만 실패하면 만들어진 노트와 오류를 구분한다. 기기 전용 모드에서도 생성/편집/재시작을 유지한다.
2. 주요 노트 동작은 이름과 툴팁을 가진 아이콘 버튼으로 표시한다. 세부 설정은 세로 세 점으로 연다. Markdown 입력 방식과 서식은 편집 중에만 펼 수 있는 도구 창에 모으고 기본 화면의 버튼 나열을 줄인다. 'Markdown을 입력하면 바로 서식이 적용됩니다.' 문구를 제거한다. 390/820/1440px·키보드·44px 터치·넘침을 검증한다.
3. Windows에서 한 줄의 중간 수정, Home/End/방향키·Backspace/Delete·Enter, 선택 교체·undo/redo와 한글 조합을 확인하고 커서/내용 회귀를 고친다. 로딩/포커스만으로 저장하거나 기존 원문을 변경하지 않는다. 저장 큐·초안·충돌/원본 보존은 유지한다.
4. 기본 실시간 편집과 원문에서 `$ 수식 $` 인라인 및 독립된 `$$` 사이의 여러 줄 수식을 입력·렌더·수정·저장·재로드할 수 있다. 수식 입력 중 명령어를 추천하고 키보드/터치로 삽입한다. 일반 금액·이스케이프·코드 영역은 수식으로 바꾸지 않는다. 기존 KaTeX trust=false와 안전한 URL 기준을 유지한다.
5. Android 네이티브 하단 업데이트 바를 제거하고 앱 설정에서 버전·상태·업데이트 확인/설치·이력을 제공한다. 자동 확인/다운로드·서명/해시·채널·동일 서명 설치와 설치 확인을 유지한다. 기존 application manage 세션에서 새 Android 바이너리와 Windows 설치본의 이번 기능을 검증한다.
6. 이번 소스로 정적/단위/클라우드 전체 검증을 수행하고 같은 staging receipt로 production 배포한다. 실제 배포 ID·앱 버전/아티팩트·업데이트 경로·제한을 기록하고 commit/push한다.

## 파악과 구현 범위

- 새 노트 두 호출부(CanvasList, MarkdownWorkspace)는 window.prompt 취소/미지원 시 API에 도달하지 않는다. Android는 onJsPrompt 미구현, Electron은 prompt 미지원이다. 생성은 제목 없음 문서를 바로 열고 제목 입력으로 수정한다.
- NoteEditor/LiveMarkdownEditor는 도구가 상시 펼쳐지고 세부 동작이 텍스트 버튼으로 나열된다. 설치된 Tiptap 3.20 math의 입력 규칙은 인라인에 `$$…$$`, 블록에 `$$$…$$$`를 사용해 사용자가 요청한 입력과 다르다. 원문 Markdown 파싱과 실제 입력 규칙을 일치시킨다.
- Android AppUpdater가 네이티브 LinearLayout에 바를 추가한다. MainActivity/설정 UI에 고정 동작만 연결하고 임의 URL·토큰·파일에 접근하는 범용 브리지는 만들지 않는다.
- 웹/Android/Windows 검증 스크립트·소유 문서가 대상이다. API/DB 계약 변경은 현재 필요하지 않다. 별도 Remote 제품과 공유 root의 다른 변경은 유지한다.

## 실행과 검증

1. 순수 입력 모델·회귀 시나리오를 먼저 추가하고 현재 실패를 기록한다.
2. 생성·아이콘/접힘 UI·한 줄 편집·수식 입력/추천을 구현하고 yarn verify와 관련 단위를 실행한다.
3. Android 네이티브 수정/빌드는 기존 application manage 세션에 인계한다. 부모 웹 작업과 별도 체크아웃에서 작업한 후 통합한다.
4. 실제 staging에 배포하고 Chromium/WebKit 및 Windows 앱에서 생성·편집·수식·저장/재로드·원문/내보내기·기기모드·Android 설정을 확인한다. 이전 전체 회귀도 함께 실행한다. 로컬 웹/API/DB 서버는 실행하지 않는다.
5. 동일 소스를 production으로 승격하고 alias/health/자산/서명 feed/앱 다운로드를 읽기 전용으로 확인한다. 최종 상태는 로그와 소유 문서에 기록한다.

## 보존과 롤백

기존 문서의 원본/초안/legacy_original을 보존하고 열기만으로 변환하지 않는다. 서식 명령은 사용자 조작에서만 실행한다. 브리지에는 고정된 업데이트 설정 열기 동작만 허용하고 origin/main-frame을 확인한다. 웹은 이전 Ready 배포로 복구하며 네이티브는 더 높은 수정 버전으로 배포한다. 사용자 데이터·인증·서명키는 삭제하지 않는다.

## 2026-10-29 확인과 남은 완료 기준

- [x] prompt 없는 두 생성 경로·아이콘/접힘·수식 입력/추천/직렬화 구현. 연속 inline math의 구분 공백을 보존하고 빠른 단일 줄 Home/End를 공개 PM 선택 API로 확정한다.
- [x] `yarn verify` 및 모델93/93, updater Node7/JVM 정책, Android 빌드/lint/기존 키 서명 검증. 이번 정리에서도 verify·93모델·updater 검사를 재실행했다.
- [x] a0628ad runtime staging `dpl_2tkedvWgj14Lw9HAc37m1F9KbWzc` READY. 집중12/12와390/820/1440 실제 화면·adjacent inline 원문/재로드/미리보기 오류0 확인.
- [x] 실제 Windows1.3.1 설치형·포터블 Notes 모두 PASS. 최신 CI40825636086(8991401)에서도 양쪽 Notes가 통과했고 aggregate 실패는 양쪽 기존 Reader의 provider402 결과 대기이며 Notes 실패로 보고하지 않는다.
- [x] Android1.3.1(13100) 양 채널 서명 APK/feed/안내 준비 및 실제 staging 파일 해시 readback. production/GitHub 공개 릴리스 완료를 뜻하지 않는다.
- [x] 같은 공개 staging APK에서 업데이트/설정 구간 PASS, canonical Android CDP 대조군5/5·실제 Notes 전체 PASS를 실행별로 확인했다. hw=yes/IMEoff 단독 실패도 정정했으며 원래 세 명령을 Android에서만 pipeline 전송한다. 물리 Gboard/입력기 검증은 별도 미완료다.
- [x] staging API always-on 정책과 actual 배포 `eba08ed9-31fc-4cfc-904e-c18dc513d554` SUCCESS/sleep=false 확인. API 소스는0c8f5ac와 동일하고 실제 signup3/3·Android 최초 로그인1/1이 통과했다.
- [ ] 사용자 보류 계약의 같은 frozen 후보129/129 통과. 자동 정의/다의어 결과 대신 명시적 보류·외부 호출0·단어/직접 메모·출처·2쪽 선택을 검증한다. 나머지 원래 기능·권한·OFF/ON·원본 보존 assertion은 유지한다.
- [ ] Windows 양쪽 Notes+Reader의 보류 안내/단어·메모 저장/재로드까지 aggregate를 완료한다. Android 같은 APK에서 변경된 공통 웹을 확인하며 물리 입력기 검증과 구분한다.
- [ ] 유효 matching blog receipt 뒤 같은 소스 canvas/web production 승격·alias/assets/auth/mobile config/8서명 feed/APK readback, Android 기존 draft target/보류 notes 갱신 후 공개와 문서 완료 정정.

최신 명시적 범위 변경으로 사전 충전/우리말샘 구현은 이번 릴리스 조건이 아니다. 사전 기능을 보류하고 다른 기능을 운영/앱 공개까지 완료한다. 미완성 우리말샘 작업은 별도 secret-free backup에 보존했으며 새 재개 요청 전 호출/production 키 등록을 하지 않는다. API stage always-on과 노트/업데이트 기능은 유지한다. 추가 재승인 없이 현재 사용자 승인 범위에서 검증·승격·릴리스를 진행한다.
