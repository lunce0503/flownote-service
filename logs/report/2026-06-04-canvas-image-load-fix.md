# 그림판 이미지 불러오기 문제 수정 보고서

작성일: 2026-06-04

## 증상

그림판에서 기존 캔버스 이미지를 불러올 때 브라우저 콘솔에 다음 유형의 오류가 발생했다.

- `Access to image ... has been blocked by CORS policy`
- `GET ...r2.dev/canvas/...png net::ERR_FAILED 404 (Not Found)`
- `이미지 원본 fallback 로드 실패`

이 문제는 특히 `assetId` 없이 R2 공개 URL 또는 `objectKey`만 남아 있는 기존 이미지 데이터에서 재현될 수 있다.

## 원인

기존 클라이언트 로직은 이미지에 `assetId`가 있을 때만 Spring API 프록시인 `/api/canvas/assets/{assetId}`를 사용했다.

`assetId`가 없고 R2 공개 URL만 있는 데이터는 브라우저가 R2 URL을 직접 읽었다. 이때 R2 공개 URL이 404를 반환하거나 CORS 헤더를 제공하지 않으면 이미지 로드가 실패했다.

또한 R2 URL에서 `canvas/...` object key를 추출해 프록시로 우회하더라도, 이미지 상태에 복원된 `objectKey`를 보존하지 않으면 다음 로컬 초안 저장에서 프록시 URL만 남아 동일한 문제로 돌아갈 수 있었다.

## 수정 내용

### 프론트엔드

파일: `flownote/src/features/canvas/model/usePersistence.tsx`

- 이미지 URL 해석 순서를 다음처럼 변경했다.
  1. `assetId`가 있으면 `/api/canvas/assets/{assetId}` 사용
  2. `objectKey`가 있으면 `/api/canvas/assets/by-key?objectKey=...` 사용
  3. R2 URL path 또는 프록시 URL query에서 `canvas/...` objectKey 추출 후 `/api/canvas/assets/by-key` 사용
  4. 위 경우가 모두 아니면 기존 URL 사용
- R2 direct URL fallback 재시도를 막아 CORS 오류 반복을 줄였다.
- hydrate 과정에서 추출한 `objectKey`를 이미지 상태에 보존해 로컬 초안과 이후 저장 흐름에서도 프록시 로드가 유지되게 했다.

### 백엔드

파일: `flownote-server/src/main/java/com/flownote/canvas/CanvasController.java`

- `GET /api/canvas/assets/by-key?objectKey=...` 엔드포인트를 추가했다.
- 기존 asset 응답과 동일하게 `Access-Control-Allow-Origin: *`, cache header, content type을 설정한다.

파일: `flownote-server/src/main/java/com/flownote/canvas/CanvasService.java`

- `readAssetByObjectKey`를 추가했다.
- `objectKey`는 `canvas/`로 시작하고 `..`를 포함하지 않는 값만 허용한다.
- 실제 R2 객체의 content type이 `image/`로 시작하지 않으면 거부한다.

## 검증

로컬 검증:

- `cd flownote-server && ./gradlew test`: 성공
- `cd flownote && yarn build`: 성공
- 저장소 루트 `docker compose up -d --build`: 성공
- `docker compose ps`: `flownote-react`, `flownote-spring`, `flownote-api`, `flownote-next`, `flownote-mobile`, `flownote-db`, `flownote-redis` 실행 확인

라우트 검증:

- 로컬 `GET http://localhost:8080/api/canvas/assets/by-key?objectKey=canvas/test/missing.png`
  - 결과: 라우트 정상 진입, 없는 객체에 대해 `404`와 `이미지를 찾을 수 없습니다.` 반환
- 운영 `GET https://flownote-production.up.railway.app/api/canvas/assets/by-key?objectKey=canvas/test/missing.png`
  - 결과: 라우트 정상 진입, 없는 객체에 대해 `404`와 `이미지를 찾을 수 없습니다.` 반환

클라우드 배포:

- Railway `flownote-main`
  - deployment: `2446fa85-8c7a-4013-83f1-6c8aeb4b0c93`
  - 상태: `SUCCESS`
- Vercel production
  - deployment: `dpl_EqiaBQX2K8EP22NUKjwPgZBpH68n`
  - alias: `https://flownote-react.vercel.app`
  - 상태: HTTP 200

## 남은 제약

이미 R2에서 실제 객체가 삭제되어 존재하지 않는 경우에는 프록시를 사용해도 이미지를 복구할 수 없다. 이 경우에는 404가 정상 응답이다.

다만 이번 수정으로 다음 경우는 R2 직접 접근 없이 Spring 프록시를 통해 로드된다.

- 새로 업로드되어 `assetId`가 있는 이미지
- `assetId`는 없지만 `objectKey`가 남은 이미지
- `objectKey` 필드는 없지만 R2 URL 또는 기존 프록시 URL에서 `canvas/...` key를 추출할 수 있는 이미지
