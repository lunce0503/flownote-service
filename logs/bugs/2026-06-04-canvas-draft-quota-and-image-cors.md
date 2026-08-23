# 캔버스 초안 QuotaExceeded 및 이미지 CORS 중복

## 증상

- 캔버스 로드 직후 `localStorage.setItem`에서 `QuotaExceededError`가 발생했다.
- 이미지 프록시 URL은 `HTTP 200`으로 응답했지만 브라우저가 CORS 오류로 차단했다.
- CORS 오류 메시지는 `Access-Control-Allow-Origin` 값이 `https://flownote-react.vercel.app, *`처럼 중복됐다고 표시했다.

## 원인

- 저장된 변경이 없는 서버 캔버스 데이터까지 로컬 초안으로 계속 저장하면서, 선 데이터가 큰 캔버스에서 브라우저 저장소 한도를 초과했다.
- 이미지 응답에서 컨트롤러가 `Access-Control-Allow-Origin: *`를 직접 추가하고, 전역 `CorsFilter`도 요청 origin을 추가해 CORS 헤더가 중복됐다.

## 수정

- 미저장 변경이 없는 캔버스 상태는 로컬 초안으로 저장하지 않고 기존 초안을 삭제한다.
- 초안 저장이 실패하면 다른 캔버스 초안을 정리한 뒤 한 번만 재시도한다.
- 이미지 응답에서 수동 CORS 헤더를 제거해 전역 CORS 필터만 헤더를 결정하게 했다.
- CORS 설정에 `*`와 특정 origin이 섞여 있어도 특정 origin을 우선 사용하고, `HEAD` 메서드도 허용한다.
