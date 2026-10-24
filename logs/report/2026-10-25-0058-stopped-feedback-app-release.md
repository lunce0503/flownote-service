# 중단 피드백 3건 공유 웹·앱 반영

작성: 2026-10-25 00:58 Asia/Seoul. 상태: 최종 전체 staging gate 진행 중. production 영수증·완료 시각은 성공 확인 후 갱신한다.

## 범위와 판단

[원인·구현 인계 보고서](2026-10-24-1211-stopped-feedback-recovery.md)의 사용자 요청 “중단된 피드백 3건의 원인을 확인하고 해결해서 배포까지 진행해줘”를 기존 앱 관리 세션에서 수행했다. 별도 세션, 중복 메일, 자동화 실패 큐 변경은 만들지 않았다.

| 피드백 ID | 실행 소스의 처리 |
| --- | --- |
| `3d6214a6-f93d-460e-a102-d94ff5210994` | pen hover/접촉·touch 위치에 도구 아이콘·이름·고대비 마커. Pencil-only 손가락 이동 및 복수 접촉·핀치·저장 보존. |
| `5db0bc5e-88c9-450f-83fa-f61827c83215` | OFF 전에 서버 스냅샷과 현재 계정 클라우드 초안/재시도 큐를 대조. 미저장 입력이면 OFF를 중단하고 기존 모드·초안을 보존. 같은 내용의 지연 ACK는 허용. OFF 후 서버 전송 금지는 유지. |
| `7110a25a-2d05-4292-b1ce-f57328eb0e19` | 사용자가 2026-10-24 직접 선택한 접수 24시간 후 NEW 숨김. 본인 목록의 표시만 바꾸며 DB 원문·서버 처리 상태·관리자 목록·자동화 원장은 유지. |

시작 시 Railway OAuth 조회는 정상이고 과거 `invalid_grant`는 원본 release.log에서 확인했다. 기존 운영은 책장 릴리스 `b9a31cb`/production `dpl_9M6a2ZcG7ppYqPLQg2a1z5qKz2Ph`였다. 공유 작업 트리의 웹 차이는 인계된 17개 파일이고 세 앱의 네이티브 실행 소스 차이는 0개였다. backend·DB·의존성·별도 `flownote-remote`는 변경하지 않았다.

## 회귀에서 보완한 점

- 첫 cloud gate 91/97 통과, 6실패로 운영 미승격. WebKit hover의 다음 RAF 좌표를 기다리고 도구 버튼에 남은 별도 마우스 이벤트를 실제 surface에서 처리한 뒤 pen sample을 검사하도록 정리했다. 좌표 허용 오차는 유지했다.
- NEW 검사는 하루치 RAF/타이머를 재생하지 않고 현재 시각 근처에서 clock을 멈춘 뒤 wall time만 옮긴다. 24시간 1초 전 표시, 2초 후 숨김, reload와 실제 DB 응답 불변을 유지한다. reload 전에는 clock을 재개한다.
- 새 포인터와 기존 플래너 패널이 형제 위치에서 같은 selectedCanvasId key를 사용해 닫힌 패널 DOM이 남고 중복 패널이 생겼다. 새 포인터 key만 `tool-pointer:`로 구분했다. 임시 stacking 변경은 되돌렸다. 패널 닫힘 뒤 0개, 재열기 뒤 1개를 검사하며 강제 클릭/첫 요소 선택으로 우회하지 않았다.
- 세 번째 전체 gate는 95/97 통과했으나 혼합 접촉 2건에서 도구 선택용 mouse와 첫 pen 이벤트가 경합했다. 실제 마우스를 surface로 옮겨 처리한 뒤 첫 pen down을 보낸다. pen hover/capture stub/상태 reset 없이 같은 CDP 6건을 3차례 반복해 18/18 통과했다. 부분 해제·핀치·서버 원본 및 필기 보존 검사는 그대로다.
- 중간 보조 실행의 빈 로그인 화면 타임아웃은 최종 실행에서 재현되지 않았고 동일 로그인 검사를 유지했다. 테스트 어댑터의 WebView context 쿠키 초기화 미지원은 CDP로, HTTP304 body 미제공은 실행 entry URL과 브라우저 캐시 SHA-256으로 검사했다. reload 후에는 실제 canvas ready/mount를 기다린다.
- 상세 재현·수정은 [회귀 기록](../bugs/2026-10-25-feedback-release-regressions.md)에 남겼다. 미통과 gate를 운영 성공으로 사용하지 않았다.

## 검증과 설치 앱

- 전체 frontend source unit 71/71, `yarn lint && yarn build` 및 수정 후 재빌드 통과. PDF.js eval·큰 bundle 경고는 기존 경고다. desktop 보조 스크립트 구문 검사 통과.
- 개별 WebKit hover 390/820/1024px, NEW 2개 viewport, 플래너 패널 닫힘/재열기 검사가 통과했다. 반복 접촉 18/18은 390/820px의 native browser pen·touch·부분 해제·핀치 검사다. 실제 물리 iPad/Pencil 인증으로 표시하지 않는다.
- [Windows 최종 검증 run 40108105195](https://github.com/lunce0503/flownote-service/actions/runs/40108105195): 기존 공개 1.3.1 설치형·포터블을 SHA256SUMS와 대조해 설치/실행했다. 이전 설치의 프로필 보존, 실제 updater 다운로드·서명/해시·재시작 캐시·중복 방지·같은 버전 skip 통과. 두 앱 모두 새 staging entry SHA-256·reload·프로세스 재시작·로그인/자료 유지·새 포인터 표시 통과. 새 바이너리 빌드/릴리스 작업은 실행하지 않았다.
- 기존 Android 1.3.0(13000) staging APK의 설치 파일 해시를 서명 feed와 대조했다. 정상적인 canvas 사용/백그라운드 후 프로세스 재시작, 로그인·기기 probe 보존, 새 entry 캐시 SHA-256, 실제 WebView CDP pen 입력의 새 마커·입력 비차단을 확인했다. API35 일반 에뮬레이터이며 실제 휴대폰 하드웨어 검증과 구분한다.
- 설치본이 검증한 runtime과 최종 staging entry가 `/assets/index-BgbQRAmA.js`, SHA-256 `6ef8095b40eb747b36c333923808b84d212c0f0bc7622fb502c504b28c3d3f09`로 동일했다. native 검증 이후 변경은 E2E harness뿐이며 app 실행 코드가 같음을 대조했다.
- iOS/iPadOS는 같은 고정 HTTPS 웹과 기존 Pencil bridge를 쓰며 이번 변경에 native API/권한 변경이 없다. 실제 WebKit 엔진과 설치 앱 UA의 cloud gate로 검증한다. 물리 기기의 hover 지원·손바닥 거부·가독성은 추가 실기기 확인 범위다.

새 네이티브 패키지는 필요하지 않아 생성하지 않았다. Android 1.3.0, Windows 1.3.1, iOS/iPadOS 1.3.0(8)은 **기존 배포 버전**이며 이번의 신규 빌드 성과가 아니다. 서버·네이티브 실행 소스와 서명된 업데이트 feed를 유지한다. 저장을 마친 뒤 앱을 완전히 종료하고 다시 열면 새 공유 웹을 불러온다.

## 소스와 배포 영수증

- 격리 worktree: `/tmp/flownote-feedback-release-20261024`, branch `release/stopped-feedback-20261024`. 공유 HEAD/index를 바꾸거나 사용자 변경을 reset하지 않았다.
- 최종 실행 commit `4072d87a71c14f23cb8f1788e0ef97ba37d65857`. 앱 실행 소스의 마지막 수정은 형제 key 구분이며 그 뒤에는 테스트·문서만 보완했다.
- 인계 source-snapshot 지문 `c889808d612bdeefb0b329cc32dba19bea02fa2101cfbe44b5a84fccb1e543d8`, 담당 보완 후 guard `0779d93f8ab3828e808027547444864f81c65b06d9a2652c2c5607228220b610`. frozen 원본 트리 guard도 배포 중 확인한다.
- 실행 명령: `FLOWNOTE_RELEASE_SOURCE_ROOT=/tmp/flownote-feedback-release-20261024 node scripts/deploy-cloud.mjs release web` (guard 포함). 모든 gate는 실제 cloud staging과 합성 계정만 사용한다. production 데이터로 기능 테스트하지 않는다.
- 최종 staging URL: https://flownote-react-staging-5lykghoht-flownote-service.vercel.app. 전체 97개 gate·production ID·동일 지문·사후 확인은 완료 후 기록한다.
- backend 실행 산출물 변경이 없어 Railway backend/Expo Go/모바일 정적 웹 재배포는 생략한다. 로컬 앱 서버·Compose는 실행하지 않았으며 Docker는 cloud browser/Android 진단에만 사용했다.

원본 failed 입력 3건은 그대로 보존했다. 성공 영수증 확인 후 자동화 관리 담당이 이력 연결·결과 통지를 수행하며 이 세션은 중복 메일을 보내지 않는다.
