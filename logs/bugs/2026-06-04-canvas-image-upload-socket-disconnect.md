# 캔버스 이미지 업로드 중 Socket.IO 연결 해제

## 증상

- 캔버스 데이터 로드는 완료됐지만 이미지 업로드 시 `업로드 실패: Error: socket has been disconnected`가 발생했다.
- 오류는 `canvas:asset-upload` 요청의 Socket.IO ack 대기 중 연결이 닫히면서 발생했다.

## 원인

- 이미지 업로드가 Socket.IO 이벤트에만 의존했다.
- 이미지 파일은 base64 data URL로 변환되어 소켓 payload가 커지므로, 네트워크 상태나 프록시/런타임 연결 재시작에 더 취약하다.
- 연결이 끊기면 ack 콜백이 실패하고, 기존 코드에는 HTTP 업로드 fallback이 없어 이미지 추가가 중단됐다.

## 수정

- 이미지 업로드 기본 경로를 Spring 서버의 기존 `POST /api/canvas/assets` multipart HTTP API로 변경했다.
- HTTP 업로드가 실패하거나 API URL이 없는 경우에만 `canvas:asset-upload` Socket.IO 경로로 재시도한다.
- 업로드 이후 이미지 로드는 기존과 동일하게 `/api/canvas/assets/{assetId}` 프록시 URL을 우선 사용한다.
