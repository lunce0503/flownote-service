# 책 읽기 조작·두 쪽 보기·한국어 다의어 사전

상태: 2026-10-27 완료. 이번 소스 e3a02f1의 전체 staging116/116·핵심9/9 및 기존 Windows/Android 설치본 검증 후 같은 지문으로 canvas/web production을 배포했다. [최종 릴리스 기록](../../../logs/report/2026-10-27-0327-reader-korean-app-release.md)에 ID·지문·화면 실측과 실물 기기 한계를 남겼다. 이전107개 gate와 구분한다.

## 완료 기준

1. 마우스 휠/트랙패드, Space/Shift+Space, 손가락 스와이프로 앞·뒤 페이지를 넘긴다. 확대 상태에서는 화면 내부 스크롤을 우선하고 끝에서만 넘긴다. 텍스트 드래그·길게 선택·다중 터치·핀치·폼/대화상자 조작은 페이지 넘기기를 발생시키지 않는다. 한 제스처로 여러 페이지가 빠르게 넘어가는 것을 막는다.
2. 읽기 제어를 깔끔한 상·하단 막대로 줄인다. 페이지/진행 상태와 작은 도구 표시 버튼은 숨김 상태에도 접근 가능하다. 잠깐 표시 후 읽기를 가리지 않게 접고, 키보드 포커스·메뉴·선택·사전/설정 대화상자는 자동으로 숨기지 않는다. 흰 페이지·베이지 배경·검정 글자와 터치/키보드 접근성을 유지한다.
3. 한 쪽/두 쪽 보기 설정을 제공하고 기기별·계정별로 기억한다. 두 쪽의 원본 PDF와 선택 텍스트를 모두 렌더링하고 홀수 마지막 페이지·상이한 페이지 크기·읽던 페이지·책갈피·사전의 실제 선택 페이지를 정확히 처리한다. 좁은 화면에서도 강제로 한 쪽으로 바꾸지 않고 사용자의 선택과 확대를 유지한다.
4. 영어 원문만 성공 결과로 표시하지 않는다. Wiktionary의 복수 뜻·품사를 가져와 서버의 공식 Gemini generateContent API로 한국어로 번역한다. 한국어 뜻을 번호/품사별로 보여주고 원문·출처도 접근 가능하게 한다. 한국어 결과는 단어장에 저장되며 기존 직접 편집한 뜻은 덮어쓰지 않는다. 기존 저장 뜻에 새 검색 결과를 반영하는 것은 사용자가 선택할 수 있다. 공급자 실패 시 한국어 오류/재시도를 제공하고 미번역 영어를 한국어 성공으로 표시하지 않는다.
5. 브라우저·Android·iOS/iPadOS·Windows의 공유 웹/기존 설치 경로, PDF 최대100MiB, 동기화 OFF/ON, 소유권/업로드/단어장 계약을 유지한다. staging-first 실제 기능 검증 후 동일 소스 production, 앱 배포는 기존 application manage 세션에서 마무리한다.

## 구현 경계

- flownote: 읽기 navigation/layout 순수 모델과 테스트, 페이지별 PDF/text 렌더 컴포넌트, BookReader, ReaderDictionary, library CSS 및 DictionaryResult 타입.
- flownote-canvas: dictionary 다의어 구조·번역 클라이언트·응답 검증/캐시·요청 제한, config/main 연결. 원본 사전/수동 메모 저장 계약 유지. 스키마 변경 없이 한국어 뜻을 기존 definition에 저장한다.
- 배포 target blog(canvas/web)을 사용한다. gateway 경로·DB 스키마가 바뀌지 않으므로 main/API/AI 서비스는 재배포하지 않는다. 필요한 번역 비밀값은 Railway 서버 환경 비밀값으로 주입하며 AI의 다른 기능을 켜지 않는다.

## 보안·API

외부 사전에는 선택어만, 번역에는 선택어와 공개 사전 정의만 보낸다. PDF 원문·계정·책 제목·단어장 메모를 전송하지 않는다. 공식 고정 HTTPS host만 사용하고 key는 요청 header/서버 환경에 두며 로그·문서·웹 번들에 기록하지 않는다. 한국어 응답 배열 길이/내용·크기·timeout을 검증하고 반복 조회는 캐시한다. 소유권 확인을 거친 lookup에 제한을 두어 불필요한 외부 사용을 막는다.

## 검증

navigation 경계/휠 burst/스와이프·다중입력/펼침 페이지 순수 모델 단위, 사전 다의어·번역 schema/error/cache/수동 메모 보존 Go 검사, yarn verify 및 Go 전체 검사, 실제 staging Chromium/WebKit의 wheel/Space/swipe/확대/선택/두 쪽/원래 페이지 단어장·한국어 복수 뜻, 전체 클라우드 회귀, 앱 설치본과 같은 소스 production ID/health/readback을 기록한다. 물리 Pencil/iPad 미연결을 브라우저 검증과 구분한다.

## 구현 진행

- 읽기 navigation/spread 모델·별도 PDF/text 페이지 렌더·겹침형 도구·휠/키/스와이프·확대/선택/다중접촉 가드와 실제 선택 페이지 사전 연결을 구현했다.
- 영어 원문 복수 뜻과 한국어 번역을 분리하고 원문 접기·명시적 단어장 반영을 제공한다. Go의 스키마/한글/크기 검증·캐시·동시 호출/사용자 조회 제한과 기존 수동 메모 보존을 구현했다.
- 모델85/85·프런트 verify·Go 전체 검사 통과. 실제 공식 번역 제공자에 2개 뜻을 요청해 각각 한국어를 반환하는 Go live audit도 통과했다.
- 기존 클라우드 키는 유효하지 않아 프로젝트에 이미 보관된 유효한 자격 증명을 사용했다. staging canvas 전용 번역 비밀값과 모델을 설정·read-back했고 deploy는 아직 실행하지 않았다. AI 서비스/비밀값은 변경하지 않았다. production은 staging 통과 후 같은 보호 절차로 전용 설정을 주입한다.
- 새 브라우저 시나리오9개를 포함해116개/25파일 등록 확인. 실제 staging 전체 실행과 production 및 앱 반영은 미완료다.

- 앱 관리 실화면 검토에서44px/툴바-선택버튼/첫줄가림/앱하단중복여백을 보완했다(e3a02f1). 핵심9/9 및 Android 실제WebView·Windows 공개설치형/포터블 새읽기 흐름,390px 스캔PDF 안내·직접한국어조회가 통과했다. 전체116개 및 production은 진행 중이며 [실행 보고서](../../../logs/report/2026-10-27-0327-reader-korean-app-release.md)에 결과를 갱신한다.

- 최종 staging116/116 통과(13.8분, retries=0), 검증 지문 `83a1221f98d99b039f4a20b98d5b1e204ec5e32c8169a1011322a91096f7260c`. production 전용 번역 설정 주입/read-back 후 matching receipt로 운영 canvas `34252ac2-7d9b-43a6-b00b-a40f4acb3c92` SUCCESS, web `dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55` READY. 배포 완료 2026-10-27 08:44:07 Asia/Seoul. 양 alias/health/서명feed/다운로드/인증/readback 전체 통과. 물리 iPad/Pencil은 미연결이며 새 네이티브 바이너리는 생성하지 않았다.
