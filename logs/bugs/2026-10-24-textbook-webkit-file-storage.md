# 전공서 PDF의 WebKit 기기 저장 실패

## 증상과 재현

웹 책장 등록은 Chromium에서 정상이나, 클라우드 staging의 iPad WebKit에서 표지를 만든 뒤 저장 오류가 발생했다. `textbook-library.spec.ts`의 등록·읽기·계정 분리 3개 흐름에서 재현했다. 독립 WebKit 진단도 동일했다. 실제 사용자 파일은 사용하지 않고 합성 PDF로 검증했다.

## 원인과 수정

IndexedDB `files` store에 브라우저 `File`/`Blob`을 직접 저장하면 WebKit이 `UnknownError: Error preparing Blob/File data to be stored in object store`를 반환했다. 메타와 파일을 같은 트랜잭션으로 추가하므로 빈 책이 발행되지는 않았다.

원본을 `ArrayBuffer`로 변환한 뒤 트랜잭션을 열어 메타와 원자적으로 저장한다. 읽기·원본 내보내기 때 PDF Blob을 복원하며 초기 Chromium prototype의 Blob도 읽을 수 있게 유지한다. 파일 변환을 트랜잭션 안에서 기다려 자동 종료되는 문제도 피한다. 계정은 변환 이후 다시 검사한다.

## 검증

기존 Chromium 검사와 동일한 iPad WebKit 등록·표지·페이지 복원·책갈피·확대·저장 실패·계정 분리 검사를 수정 소스의 staging에서 재실행한다. 통과 결과와 실제 배포 ID는 최종 작업 보고서에 기록한다. 실패한 소스로 production 배포하지 않는다.

별도로 첫 전체 gate의 기존 Android 노트 생성 요청은 2026-10-23T15:21:52Z의 staging gateway `/api/notes` POST 502로 실패했다. 같은 합성 요청을 독립 확인한 결과 생성·정리 모두 HTTP 200이었다. 이는 신규 책장 저장 오류와 다른 원인이며, 테스트를 완화하지 않고 전체 gate를 재실행한다.
