# 작업 공간·책장 앱 반영 진행 기록

2026-10-26 Asia/Seoul. 완료: 21:22. 상태: 여섯 요구사항 구현·전체 staging 107/107·같은 소스 production main/canvas/api/web·기존 앱 반영·사후 확인 완료. 기존 application manage 세션에서 작업을 재개했다.

## 소스와 수정

- 격리 소스 `/tmp/flownote-workspace-library-20261026`, 브랜치 `codex/workspace-library-20261026`. 공유 루트를 배포 소스로 사용하지 않았다.
- 최초 구현 `1daddb2`, OFF/ON 책장 E2E·백업 안내·완료 업로드 한도 수정 `76cab9a`, Markdown 재로드/저장 오류 알림 및 E2E 보완 `0c8f5ac`. push 완료.
- 여섯 요구사항의 범위를 유지한다. [실행 계획](../../docs/exec-plan/active/2026-10-26-workspace-library-ux.md)을 따른다.

## 검증

- 웹 yarn verify 통과. 프런트 모델 81/81, lazy bundle 1/1. API 31/31, Spring Gradle test, Go 전체 패키지 통과. Go 도구는 Docker golang:1.23으로 검사했다.
- 첫 staging main `74a29a4e-6a80-457a-8ba3-f1d39962a15f`, canvas `a2d628bd-4047-4ba4-8a5d-939216572557`, api `f3573f9d-375f-4a95-bf2e-14cf767fd2bc` 성공. web immutable `https://flownote-react-staging-omarurfz8-flownote-service.vercel.app`.
- 첫 전체 게이트는 107개 중 101번째까지 로그가 남았고 사용량 제한으로 중단됐다. 실패는 노트 전환 locator race, 통합 목록 heading, 테스트 간 선 의존성, 파일 생성 오류 알림 소실, Chromium/WebKit Markdown 재로드였다. 해당 원인들을 수정했다. 첫 gate를 통과로 기록하지 않는다.
- 첫 staging에서 실제 library API 소유권·청크 해시·revision/tombstone, 100MiB 업로드/다운로드 원본 동일성, OFF→메타/단어장 기기편집→ON→두 번째 iPad WebKit 반영, 실제 텍스트 drag→사전→단어장·삭제 전파, 접촉 커서 숨김/32px 지우개와 기존 4px 호버가 통과했다. 신규 library API 동작으로 V22 테이블의 실제 staging 사용을 확인했다.
- 수정 후 `node scripts/deploy-cloud.mjs release library`로 main/canvas/api/web staging 및 전체 gate를 재실행 중이다. main `37fcfddc-811a-4494-8bc0-92d4995980c8`, canvas `084381ad-7323-44ab-9b78-d3b85c799759` 성공. api `fcaa8c8e-67d7-4f41-935f-e1dbcecde32a` 진행 중. 최종 결과는 아래에 갱신한다.

## 네이티브 상태

- 모바일 실행 소스는 이전 배포와 동일하다. 기존 Android 1.3.0(13000), Windows 1.3.1, iOS/iPadOS 1.3.0(8)의 공통 웹 반영을 검증하며 새 바이너리 출시로 표시하지 않는다.
- 2026-10-26 재조회: iOS EAS `41bfceb7-2933-4ab8-984c-511034baca24` FINISHED, 제출 `8666f90e-2c6b-4db0-afc8-3e82d748a2c2` FINISHED. Apple build `0553dd73-70ee-491f-80c6-4390bb49196c` VALID, 내부 IN_BETA_TESTING, Team (Expo) 그룹 배정·테스터 1명 유지.
- Android 기존 API35 AVD의 1.0.0 staging 설치 위에 정확한 공개 1.3.0 staging APK를 `adb install -r`로 업데이트했다. 데이터 삭제 없이 versionCode=13000 확인. 현 사용자의 KVM 그룹 권한이 없어 Docker 장치 연결로 에뮬레이터를 부팅했다.
- 물리 iPad/iPhone·Apple Pencil은 미연결이다. WebKit와 합성 pointer 검사는 하드웨어 동작 확인과 구분한다.

## 완료 기준과 실행 경계

수정 후 전체 staging, 같은 소스 production ID/지문/health/readback, 기존 Windows·Android 앱 실행/업데이트 경로를 아래 증거로 완료했다. 소유 문서와 인계 상태를 정정했다. 로컬 웹/API/DB/Compose는 실행하지 않았으며 production 테스트 데이터도 만들지 않았다. Docker는 단위 도구·클라우드 Playwright·Android 에뮬레이터 실행에 사용했다.

## 재검증 확정 (2026-10-26 21:11 Asia/Seoul)

- 전체 staging **107/107 통과**, retries=0, 13.2분. 검증 시각 `2026-10-26T12:11:07.053Z`. 실행 로그 `/tmp/flownote-workspace-library-release-resume.log`.
- staging web `dpl_GGLT2SFAm9s5FFMvz6rvznd5xoxS` READY. main/canvas/api는 위 재배포 ID 모두 SUCCESS.
- release receipt 지문 `e865ae8000d28005c7f8bcdd3908310f901bb5ebcb06950dcaaaf8b7f609e6a6`. 같은 지문으로 production 승격 진행 중.
- Windows [run 40318748729](https://github.com/lunce0503/flownote-service/actions/runs/40318748729) SUCCESS. 공개 1.3.1 installer/portable 정확한 파일·해시, 이전 1.0 설치에서 프로필 보존 업그레이드, updater 다운로드·캐시·같은 버전 skip, 두 설치본의 현재 staging entry SHA-256 및 프로세스 재시작 후 로그인/기기 자료 보존 통과. 새 Windows 바이너리는 생성하지 않았다.
- Android 정확한 staging 1.3.0(13000) APK의 설치 파일 SHA와 signed feed 일치, 현재 staging entry SHA-256, 재로드/프로세스 재시작 후 로그인·기기 자료, 실제 WebView의 합성 펜 이벤트/4px marker 확인 통과. `/tmp/flownote-library-android-native.log`. 물리 펜 하드웨어 검증이 아니다.

## production 및 최종 사후 확인

`node scripts/deploy-cloud.mjs release library`가 성공 종료했다. 운영 배포 완료 시각 `2026-10-26T12:20:16.133Z` (21:20:16 Asia/Seoul). staging/production receipt 지문은 모두 `e865ae8000d28005c7f8bcdd3908310f901bb5ebcb06950dcaaaf8b7f609e6a6`이다.

| 서비스 | production deployment | 상태 |
| --- | --- | --- |
| main | d9183d45-4259-4069-92d1-5445609c4bd0 | SUCCESS |
| canvas | ca217ecd-3ac9-4403-9190-08298d3d5ef9 | SUCCESS |
| api | 8e0aa10c-2372-451a-acb8-00d8f2dbeb96 | SUCCESS |
| web | dpl_EqEmiv3Qt3rayKM27gqezAybGL8s | READY |

운영 immutable URL: https://flownote-react-goo3ol8pw-flownote-service.vercel.app. 사용자 alias https://flownote-react.vercel.app.

- 양 환경 Postgres에 읽기 전용 SQL로 `flyway_schema_history`의 version=22, description=textbook cloud library, success=true를 직접 확인했다. 별도 로컬 DB는 실행하지 않았다.
- 양 alias의 실제 deployment ID·READY·entry 자산 200과 `/library`, `/canvas`, `/blog`, Android/Windows 다운로드 안내 페이지 200 확인.
- staging/production 도메인 × staging/production 채널 × Android/Windows의 8개 feed가 로컬 릴리스 소스와 byte-for-byte 일치, RSA 서명·버전·채널·no-store 일치. Android 실제 APK 크기/SHA-256 및 Windows 공개 파일 HEAD 크기 확인. Windows 전체 파일 해시는 위 GitHub 설치본 검증에서 확인했다.
- gateway 200, 비인증 users/me 401, 비인증 library/books 401, 환경별 mobile config의 웹 origin 일치. `/tmp/flownote-library-readback.log` 전체 PASS.
- 운영 중 새 결함이 확인되면 DB V22의 기존 데이터/테이블을 삭제하지 않고 호환 이전 서비스/웹 배포를 복구한다. 새 library API는 인증을 유지한다.

## 사용자 설치와 남은 물리 기기 확인

기존 Android 1.3.0(13000)·Windows 1.3.1·TestFlight iOS/iPadOS 1.3.0(8) 앱을 완전히 닫고 다시 열면 새 공통 웹 기능을 받는다. [Android 안내](https://flownote-react.vercel.app/android.html)·[Windows 안내](https://flownote-react.vercel.app/windows.html)와 기존 TestFlight 내부 그룹을 유지했다. 새 네이티브 바이너리를 생성하거나 새 TestFlight 빌드 번호로 표시하지 않았다.

물리 iPad/iPhone Files·공유 시트·Apple Pencil 본체 double-tap/호버의 하드웨어 검증은 기기 미연결로 남는다. 기존 모듈과 브리지 소스는 이전 검증/릴리스와 동일하며 WebKit·합성 pointer 검사와 구분한다. 책장 PDF 원본은 기기 JSON 백업에 포함되지 않으므로 책장에서 별도로 내보내도록 설정 안내를 추가했다.

마지막 문서 정정은 실행 소스를 바꾸지 않는다. 위 동일 소스 배포 후 추가 backend/Vercel 배포는 생략하며 commit/push로 저장소 기록을 확정한다.
