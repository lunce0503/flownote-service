# 터치 드래그 중 대상 기기 중지 시 해제 누락

## 증상과 재현

0.6.0 개발 검사에서 실제 TLS 소스가 `pointer.down`을 전송한 뒤 서버가 대상의 사용을 중지하면 `TouchInputChecks`의 target pause → up 적용 조건이 시간 초과했다. 대상은 state에서 enabled=false를 받은 뒤 서버의 정리용 `pointer.up`도 일반 제어와 함께 거부했다.

## 원인과 수정

`RemoteClient`의 일반 `!Enabled` 가드가 해제 명령까지 막았다. 비활성 상태에서는 `pointer.up`만 예외로 출력 처리에 전달한다. 새 누르기·이동·클릭은 계속 차단한다. Windows는 자기 기기 중지 상태를 받아도 직접 Release하고, 연결 종료/로컬 OFF/1.5초 유휴 감시로도 해제한다. 서버는 소유자 종료·pause·유휴에 정리용 up을 보낸다.

## 검증

수정 후 `dotnet run --project tests/Flownote.Remote.Network.Checks -c Release -- --touch` 통과. 소스 pause, 대상 pause, 소스 연결 종료, 유휴 시 실제 출력 콜백의 up을 확인한다. Windows 실제 SendInput 검사는 별도 플랫폼 CI의 `TouchPointerChecks`가 소유한다. 결과는 [작업 보고서](../report/2026-10-27-1551-phone-touch-remote.md)를 따른다.
