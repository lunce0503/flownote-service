# 책 읽기·한국어 사전 앱 반영

2026-10-27 Asia/Seoul. 완료:08:45. 상태: UX 검토·수정·이번 staging116/116·기존 앱 반영·같은 소스 production·사후 확인 완료. 기존 application manage 세션이 실행했다. 이전 f90a1b9 배포와 구분하며 아래 진행 기록의 미완료 표현은 각 단계 당시 상태다.

## 소스와 검토

격리 소스 `/tmp/flownote-library-reader-korean-20261027`, `codex/library-reader-korean-20261027`. 구현 db6c61c·zoom 보존 c848348의 원격 push를 확인했다. 공유 root와 별도 Remote 제품은 수정·배포하지 않는다. target blog(canvas/web), DB/gateway/AI/native 실행 소스는 변경하지 않는다.

앱 관리 UX 보완: 44px 터치 영역(9a8b43b), 툴바 실제 높이에 따른 선택 검색 버튼 위치와 네이티브 읽기 검사(78cc176), PDF 첫 줄 가림/작은 화면 중복 설정 정리(0fe3c6b), 읽기 화면의 앱 하단 여백 중복 제거(e3a02f1). 각 수정 후 yarn verify 통과. 인계 모델85/85·Go 전체 검사 통과 증거를 확인했다.

## 실제 발견과 수정

- 처음 집중9개는6 pass/3 fail. Mobile WebKit의 mouse.wheel API 미지원과390/820px 상단 도구가 PDF 첫 줄을 가리는 문제가 원인이었다. WebKit DOM wheel smoke·Chromium 실제 휠을 구분하고 PDF 시작 여백을 안정적으로 확보했다. 새 동작 요구를 skip하지 않았다.
- 390px fullPage가1076px인 원인은 App·책장에76px 여백이 중복된 것이었다. 실제 Android WebView 측정에서도 viewport867/document943, 양쪽76px을 확인했다. 읽기 전용 wrapper에서만 중복 여백을 제거하고 PDF 내부 auto 스크롤은 유지한다.
- 하단 토글과 표시 버튼은 최소44px. 모바일 중복 설정은 More 메뉴에 남기고 하단 툴바는 간결하게 유지한다. 선택 검색 버튼은 ResizeObserver 측정 높이 위12px. 실제 PDF 드래그 중 도구를 표시한 상태에서 사각형 비겹침·터치크기·overflow·body높이를 검사한다.
- 첫 실제 데스크톱 두 쪽 PDF 선택→공식 번역 제공자의 한국어 복수 뜻→2쪽 단어장 저장은 통과했다. 전체 완료 증거는 최종 동일 소스 전체 gate로 확정한다.

## 배포 진행

Go 실행 소스는 db6c61c 이후 동일하다. staging canvas `b8e3acac-e8aa-4b7a-b5ac-6300963c9510` SUCCESS를 명시적으로 재사용하고 변경된 web은 새로 배포한다. 중간 실행은 발견된 UX 수정 반영을 위해 해당 프로세스/테스트 컨테이너만 종료했다. 중복 release 프로세스를 만들지 않았다.

현재 `node scripts/deploy-cloud.mjs staging blog`가 e3a02f1의 새 web 및 전체116개/핵심9개를 검증 중이다. staging translation 전용 key/model은 기존 보호된 stdin 절차로 설정됐다. production 전용 설정은 staging 성공 이후에만 적용한다. 비밀값·사용자 PDF·선택어/개인 메모는 로그에 남기지 않는다.

## 앱·완료 기준

기존 Windows1.3.1 installer/portable와 Android1.3.0(13000) 실제 WebView에 새 읽기 조작·두 쪽·PDF glyph drag·한국어 다의어를 실행한다. Windows 첫 run40376717161의 이전 설치 업그레이드/updater 검사는 통과했으나 PDF 선택이 상단 도구 가림으로 실패해 새 소스로 재실행해야 한다. Android도 같은 선택 문제를 확인했고 새 소스로 재검증한다. iOS1.3.0(8)은 기존 TestFlight 상태를 재조회하며 물리 iPad/Pencil 미연결을 구분한다.

전체116개 성공·화면 실측/스캔 안내·앱 검사 후 production 전용 번역 설정, matching receipt production blog, deployment IDs/지문/health/readback, 소유 문서 정정·commit/push까지 완료해야 한다. 로컬 웹/API/DB/Compose 서버는 실행하지 않는다. production에는 테스트 자료를 쓰지 않는다.

## e3a02f1 실제 검증 결과

- 핵심9/9 통과(51.2초), retries=0. 390px·1440px Chromium 실제 wheel/키·터치, 820px WebKit DOM wheel/터치 smoke와 실제 mouse glyph drag, 두 쪽·홀수 끝·설정 복원·한국어 복수 뜻·선택한2쪽 기록·44px·도구와선택버튼 비겹침·외부 문서높이를 포함한다. 전체116개 gate는 진행 중이다.
- 390/820/1440px의 한 쪽/두 쪽·도구 표시/실제 텍스트 선택 캡처를 직접 확인했다. `/tmp/flownote-reader-focused-final/` 아래 화면. 첫 줄이 가려지지 않고 하단 도구/선택검색/영구 진행 표시가 겹치지 않는다.
- 별도 스캔 PDF 실제 UI에서 텍스트 없음 안내→More→직접 사전 검색→한국어8뜻 표시와 접힌 원문을 확인했다. 390×1000 viewport에서 body/document1000, PDF overflow-y=auto. `/tmp/flownote-reader-scan-qa.log`, scan-guidance 및 korean-dictionary PNG.
- Android 공개 staging1.3.0(13000) 정확한 APK·번들SHA, 로그인/기기자료/재시작, 실제 WebView wheel·Shift+Space·CDP touch·두쪽glyph drag·선택버튼 비겹침·한국어다의어·2쪽기록 전체 통과. `/tmp/flownote-reader-android-native-final.log`.
- Windows [run40378052355](https://github.com/lunce0503/flownote-service/actions/runs/40378052355) SUCCESS. 기존1.0→공개1.3.1 설치 업그레이드/프로필 보존, 설치형/포터블 signed updater/hash/cache 및 두 설치본의 새 entry SHA·재시작·읽기 흐름(wheel/Space/두쪽/실제glyph drag/한국어다의어/2쪽기록) 통과. 실행 소스는 e3a02f1이다.

## 전체 staging 확정 (2026-10-27 03:41:58 Asia/Seoul)

- 전체 **116/116 PASS**, retries=0, 13.8분. 핵심9개도 전체 실행 안에서 재통과했다. `/tmp/flownote-reader-app-staging-final4.log`.
- staging canvas `b8e3acac-e8aa-4b7a-b5ac-6300963c9510` SUCCESS, web `dpl_EdCYXgFpS6p8A8YmyhtpcDRWi95y` READY, immutable `https://flownote-react-staging-hd2008hjt-flownote-service.vercel.app`.
- receipt 지문 `83a1221f98d99b039f4a20b98d5b1e204ec5e32c8169a1011322a91096f7260c`. production 전용 번역 key/model을 보호된 stdin 절차로 주입/read-back했고 같은 receipt로 production blog 진행 중이다. 다른 AI 서비스 key·기능은 변경하지 않았다.
- iOS EAS `41bfceb7-2933-4ab8-984c-511034baca24`와 제출 `8666f90e-2c6b-4db0-afc8-3e82d748a2c2` FINISHED, Apple build8 VALID/IN_BETA_TESTING·Team (Expo) 그룹/테스터1명 재확인. 새 네이티브 바이너리는 필요하지 않아 생성하지 않았다.

## production 완료 및 사후 확인

보호된 `/tmp/flownote-configure-reader-translation.py production`이 canvas 전용 번역 key/model 주입·read-back을 성공했다. 비밀값은 stdin으로만 전달했고 출력하지 않았다. 이어 matching staging receipt로 `node scripts/deploy-cloud.mjs production blog`를 성공 종료했다.

| 환경 | canvas | web |
| --- | --- | --- |
| staging | b8e3acac-e8aa-4b7a-b5ac-6300963c9510 SUCCESS | dpl_EdCYXgFpS6p8A8YmyhtpcDRWi95y READY |
| production | 34252ac2-7d9b-43a6-b00b-a40f4acb3c92 SUCCESS | dpl_BmWBxsWc4ffYw3DwuM4V3m8EfS55 READY |

운영 배포 완료 `2026-10-26T23:44:07.283Z` / 2026-10-27 08:44:07 Asia/Seoul. immutable https://flownote-react-4y8ngisnu-flownote-service.vercel.app, 사용자 alias https://flownote-react.vercel.app.

staging/production 실행 지문은 모두 `83a1221f98d99b039f4a20b98d5b1e204ec5e32c8169a1011322a91096f7260c`. 실행 소스 e3a02f1. main/API/AI/DB/native 실행 소스 변경이 없어 별도 배포·마이그레이션·새 앱 바이너리는 만들지 않았다. staging에서 명시 재사용한 canvas는 이 Go 실행 소스와 동일하다.

사후 읽기 전용 검사 `/tmp/flownote-reader-production-readback.log` 전체 PASS:

- 양 alias 실제 deployment ID·READY 및 entry 자산200, library/canvas/blog와 Android/Windows 안내200.
- 양 환경 gateway200, 비인증 users/me401·library/books401, 환경별 mobile config origin 일치.
- 양 도메인×양 채널×Android/Windows 총8개 signed feed가 이번 릴리스 소스와 byte-for-byte 일치하며 RSA 서명·버전·no-store 확인. Android 실제 APK 크기/SHA-256·Windows 공개 파일 HEAD 크기 확인. Windows 공개 전체 파일 해시는 위 실제 installer/portable 워크플로에서 확인했다.
- production에는 테스트 계정·PDF·단어장을 쓰지 않았다. 실제 공급자 한국어 응답·자동 저장·수동 메모 보존은 이번 staging 및 설치 앱 검사로 확인했다.

## 사용자 반영과 제한

기존 Android1.3.0(13000), Windows1.3.1, TestFlight iOS/iPadOS1.3.0(8)을 완전히 닫았다 다시 열면 새 공통 웹을 받는다. 기존 GitHub 다운로드와 TestFlight 내부 그룹을 유지했다. Android 실제 WebView 및 Windows 설치형/포터블에서 새 읽기 흐름과 Korean multi-sense를 확인했으며 iOS는 WebKit/브리지 검사와 TestFlight 상태 재조회로 확인했다.

물리 iPad/iPhone의 선택 핸들·핀치·Files/공유 시트·Pencil 본체는 미연결로 남는다. WebKit wheel/터치는 DOM smoke, Chromium CDP 터치는 에뮬레이션이며 실제 손가락 하드웨어와 구분한다. 테스트용 Android 에뮬레이터 컨테이너는 종료했다.

문제 발생 시 이전 호환 canvas/web 배포로 복구하며 key나 사용자 PDF/단어장 데이터를 삭제하지 않는다. 마지막 변경은 소유 문서/보고서 상태 정정뿐이며 실행 지문을 바꾸지 않으므로 추가 클라우드 재배포를 생략한다. 문서 링크·diff 검증 후 commit/push로 기록을 확정한다.
