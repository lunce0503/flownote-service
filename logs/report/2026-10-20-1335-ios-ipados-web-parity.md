# iOS/iPadOS 1.1.0 웹 기능 공유

2026-10-20 KST. 사용자가 기존 TestFlight 연결 후 iOS/iPadOS도 웹 버전과 같게 빌드하도록 요청했다. 진행 중 기록이며 마지막 상태 절이 최종 기준이다.

## 구현 경계

- 영향: `flownote-mobile`의 iOS 진입점·네이티브 패키징, `flownote`의 앱 UA 식별·공용 파일 export. API/DB/운영 데이터 계약은 변경하지 않았다.
- iOS/iPadOS 1.1.0은 `app/index.ios.tsx`에서 WKWebView를 사용해 같은 Vercel 웹과 same-origin gateway를 사용한다. 기존 Expo Android/정적 웹은 유지하고 iOS에서만 이전 auth/app route group을 보호해 웹 진입점으로 모은다.
- `FlownoteIOS/1.1.0`은 기존 installed-app UI에 참여한다. 웹의 전체 capability route/권한/개발 중 상태, 최신 Notes/Canvas/Planner 기능을 공유하며 기존 Flownote 헤더를 숨기고 아이보리·검정 앱 테마/하단 탐색을 사용한다. 일반 iPad Safari는 바꾸지 않는다.
- 동일 bundle `com.flownote.mobile`, iPhone/iPad 및 회전 지원 유지. App Store Connect 앱 ID `6824777358`는 실제 최초 제출 FINISHED에서 확인한 값이다. 기존 사용자 서명 키를 EAS에서 재사용하며 비밀값은 기록하지 않는다.
- 새 웹 쿠키 저장소를 사용하므로 이전 Expo 토큰을 주입하지 않는다. 1.0.0→1.1.0은 한 번 재로그인이 필요하다. 기존 네이티브 로컬 초안은 삭제하지 않지만 웹으로 자동 이관하지 않는다. 서버 자료는 같은 계정으로 재조회한다.

## 보안·UX

- production/staging 두 HTTPS web origin만 설정 가능. 누락/잘못된 값은 오류로 표시하고 fallback하지 않는다. 내부 탐색은 정확한 origin만, 외부 HTTPS/mailto/tel은 사용자 확인 후 OS에서 열며 다른 protocol·URL credential은 차단한다. `originWhitelist=['*']`는 기본 OS fallback을 피하고 모든 URL을 자체 검사하도록 하기 위한 것이다.
- iOS ATS 임의 HTTP/로컬 네트워크 예외를 제거했고 Info.plist introspect에서 false/false/빈 예외 목록을 확인했다. 시스템 사진·촬영 권한 설명을 추가했다. 웹 미디어 캡처 자동 허용, 디버깅, 파일 URL 접근, pull-to-refresh, 뒤로 스와이프는 비활성이다. 오류/프로세스 종료는 재연결 UI를 제공하고 세션/초안을 삭제하지 않는다.
- 파일 bridge는 `flownote.export` 정확한 schema·source origin·base64·MIME allowlist·8MiB·파일명 제한만 허용한다. native 확인 후 cache 파일을 iOS 공유 메뉴에 전달하고 삭제한다. 토큰/쿠키/임의 파일 읽기·일반 네이티브 메서드·임의 URL HTTP 호출은 없다. Markdown/원본·초안 JSON/ICS 공용 export를 연결했고 브라우저·Windows·Android는 기존 다운로드 경로를 유지한다.
- WebKit staging screenshot으로 iPad 전체 기능 메뉴와 iPhone 홈의 테마·탐색·레이아웃을 확인했다. 캡처는 synthetic account뿐이며 `/dev/shm/flownote-ios-web-screens/`에 있다.

## 정적 검증·알려진 재시도

- TDD: 없는 native policy 모듈에 대한 테스트 실패 확인 후 구현. 모바일 scripts 10개 및 UA 정책 1개 통과. lint/typecheck 통과. iOS 배포 번들 및 기존 Expo 웹 빌드 성공.
- `flownote/yarn build` 성공. 루트에서 한 번 실행한 `yarn build`는 해당 script가 없는 위치 오류였으며 올바른 하위 프로젝트에서 재실행했다. 기존 PDF.js eval/번들 크기 경고는 유지한다.
- `expo install --check`에서 SDK 54 권장 patch 5개 경고를 확인했다. expo 54.0.37, constants 18.0.14, font 14.0.12, file-system 19.0.24, router 6.0.24 범위로 올리고 두 lockfile을 동기화한 뒤 Dependencies are up to date를 확인했다. 대규모 SDK 전환은 하지 않았다. WebView 13.15.0, sharing 14.0.8은 SDK 54 계약에 맞춘다.
- 최초 screenshot 도구는 node_modules를 다른 basename에 mount해 playwright-core를 찾지 못했다. 올바른 node_modules 경로 mount로 재실행해 WebKit 캡처에 성공했다. 제품 오류는 아니며 앱 서버를 로컬에서 실행하지 않았다.
- EAS archive inspect는 새 iOS shell/policy와 두 lockfile 포함을 확인했다. 최종 native 패치 이후 다시 archive/번들 검증한다. 비밀 파일/다른 서비스/node_modules는 업로드하지 않는다.

## 클라우드·네이티브 검증

- 고정 웹 snapshot: `/dev/shm/flownote-ios-parity-release-20261020`. 여기에 기존 배포된 사용자 미커밋 소스도 포함하며 사용자 HEAD/index를 되돌리지 않았다.
- cloud gate에 Chromium 기존 55개 + iOS 시나리오 4개 + WebKit iOS 시나리오 4개를 포함했다. 실제 cloud staging만 사용하고 운영 CRUD 시험은 하지 않는다. 로그인/세션 reload·기능 메뉴·한글 Markdown cloud 저장/정확한 export payload·ICS·Canvas pointer 저장/재조회가 대상이다.
- 클라우드 fingerprint는 web/backend 실행 소스 범위다. mobile native 파일은 별도 EAS archive와 소스 snapshot으로 고정/검증한다. native 전용 ATS/SDK patch를 web gate 소스 변경으로 오인하지 않으며, production 웹은 staging과 같은 snapshot을 사용한다.
- 실제 iPad WKWebView 프로세스 재시작·시스템 파일 선택/공유 UI·Apple Pencil 압력/손바닥 거부는 자동화하지 못했다. WebKit 브라우저 pointer 시험을 실제 Pencil 시험으로 주장하지 않는다. TestFlight 실기기 확인이 남는다.
- backend/API/DB 변경이 없어 Railway 바이너리를 재배포하지 않는다. staging-first web 배포는 배포 스크립트의 환경/Serverless 정책과 E2E를 유지한다. EAS store/TestFlight 업로드는 공개 App Store 심사/출시가 아니다.

## 마지막 상태

진행 중: 최종 cloud staging gate, 동일 웹 소스 production 승격, 최종 native archive/EAS Xcode 빌드와 TestFlight 업로드. 완료 ID/상태는 이 절에 덧붙인다.
