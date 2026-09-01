# Railway production Expo Go access

## 결과

- Railway project: `flownote` (`07ae56ef-08be-432d-948b-8f3b6ecb6cd5`)
- Environment: `production` (`ae55fc37-9251-48d1-bdbe-87a2ea3462fa`)
- Service: `flownote-expo-go` (`ce14582c-b711-4a7f-accb-7f48bf8e5cb1`)
- Deployment: `e44f313d-0c4d-4cac-8dbc-0aee4291980e`, `SUCCESS`
- Expo Go URL: `exps://flownote-expo-go-production.up.railway.app`
- Manifest URL: `https://flownote-expo-go-production.up.railway.app`
- Public API: `https://flownote-api-production.up.railway.app`

기존 `flownote-mobile-production` 정적 웹 서비스와 staging의 `flownote-mobile` 서비스를 변경하지 않고, production에 Expo Go Metro 전용 서비스를 분리했다.

## 구현

- `flownote-mobile/Dockerfile.expo-go`: Railway production Metro 컨테이너
- `flownote-mobile/scripts/start-expo-go.mjs`: Railway domain과 port를 검증하고 `EXPO_PACKAGER_PROXY_URL`을 HTTPS로 고정
- `flownote-mobile/scripts/start-expo-go.test.mjs`: 시작 인자, 환경 변수, 잘못된 설정 거부 테스트
- `docs/product-specs/expo-go-railway-access.md`: iPhone, iPad, Android phone/tablet 접속 및 점검 매뉴얼

## 검증

- `npm test`: 5개 테스트 통과
- `npm run lint`: 통과
- `npm run typecheck`: 통과
- `npm run verify`: 통과, Expo Web export 포함
- `docker build -f Dockerfile.expo-go -t flownote-expo-go:verify .`: 통과
- 컨테이너 iOS/Android manifest와 bundle: 로컬 검증 통과
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 전체 이미지 빌드 및 컨테이너 기동 통과
- 로컬 React, API mobile config/docs, Spring, Canvas, Serve, Expo manifest: HTTP 200
- Railway iOS manifest: HTTP 200, runtime `exposdk:54.0.0`, launch asset 동일 domain, bundle HTTP 200, 6,923,972 bytes
- Railway Android manifest: HTTP 200, runtime `exposdk:54.0.0`, launch asset 동일 domain, bundle HTTP 200, 6,918,016 bytes
- Railway mobile config API: HTTP 200, `application/json`

## 운영 및 롤백

Railway가 주입하는 `RAILWAY_PUBLIC_DOMAIN`으로 Expo manifest와 asset URL을 생성한다. 앱의 데이터 요청은 `EXPO_PUBLIC_WAS_URL=https://flownote-api-production.up.railway.app`을 사용한다. Expo Go가 안정적으로 접속할 수 있도록 application sleep은 사용하지 않는다.

문제가 생기면 Railway `flownote-expo-go` 서비스에서 이전 성공 deployment를 redeploy한다. 정적 모바일 웹과 백엔드 서비스는 별도이므로 이 롤백의 영향을 받지 않는다.

## 잔여 위험

- Expo Go URL과 JavaScript bundle은 공개 endpoint다. 사용자 데이터 보호는 기존 API 인증·권한 검사를 계속 사용해야 한다.
- 현재 의존성 설치 감사 결과는 27건(낮음 1, 보통 10, 높음 14, 치명적 2)이다. 이번 배포에서 자동 major upgrade는 하지 않았다.
- Expo SDK 54 패키지 일부가 권장 patch보다 낮다. 별도 호환성 검증 후 patch update가 필요하다.
- 모바일 Canvas 저장 계약은 아직 안정화 대상이다. 실데이터 편집 전에 테스트 계정과 테스트 노트로 확인한다.
