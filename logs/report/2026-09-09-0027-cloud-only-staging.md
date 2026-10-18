# 클라우드 전용 전환과 캔버스 컨트롤 완료 기록

## 상태

완료. PC 내부망/loopback 실행 경로를 제거하고 cloud staging 검증 후 같은 소스를 production에 배포했다. 후속 캔버스 컨트롤도 staging 검증 후 production에 반영했다.

## 변경

- 웹 LAN hostname 치환과 모바일 로컬 API fallback, Compose/LAN 실행 스크립트를 제거했다.
- 로컬 Ollama 구현을 제거하고 기존 API는 410 호환 응답만 제공한다.
- Railway private networking은 유지하되 클라이언트에는 공개 Railway HTTPS만 허용한다.
- staging/production의 Railway 환경, Vercel 프로젝트, mobile WAS, Expo Go 서비스를 분리했다.
- Vercel JSON 응답 파싱, Railway API 일시 타임아웃 재시도, Vercel JS/CSS 자산 준비 확인을 배포 스크립트에 추가했다.
- 웹·모바일·Spring의 staging fallback을 제거했다. 선택 환경 URL이 빠지면 다른 환경으로 연결하지 않고 빌드/기동이 실패한다.
- 펜 버튼이 색상 팔레트 dialog를 열고, 저장 상태는 아이콘만 표시하며 확대율/좌표는 좌하단에 고정한다.
- 최초 canvas load 중 입력을 잠그고 빠른 획 상태를 동기 ref로 관리해 첫 획 유실을 막았다.

## 최종 배포

### Staging

- source fingerprint: `f34f3ff2e0fdff84576bcf299ff1703433421b4a4bc5bcb9e9051780b9a9e360`
- Vercel: `dpl_DVuNPWVWCECWMKaDa7ViFv3zsfm3` → `https://flownote-react-staging.vercel.app`
- Railway main: `5c9e39e1-48a3-42f4-8407-6b04106d494e`
- Railway canvas: `fbc023eb-e231-4513-8f37-2c58718ed086`
- Railway serve: `3e61ea8a-978d-40e6-96f4-4022a3fe7e15`
- Railway AI: `ae6b163e-0c13-4060-ad93-7d2794850e24`
- Railway API: `b1c34280-8d23-4389-8405-5fd8ecd9113f`
- Railway mobile: `1a6abdfa-b08d-426b-ad96-0b94ee4a4d94`
- Railway Expo Go: `8b7b2c62-ab18-494c-9d75-7c84b0177315`

### Production

- Vercel: `dpl_9ZrB8E39YHDCMHeaYJXFGw58X9r9` → `https://flownote-react.vercel.app`
- Railway main: `0214bff4-39cc-47d6-8d33-2744bd6cc593`
- Railway canvas: `74e7e28e-2596-477e-8d65-b7b0012e558b`
- Railway serve: `3fc1f53f-8e8d-41ed-a6e5-347bd30047b9`
- Railway AI: `4b3a0f9b-44c9-48a6-87d0-b88cebad1e26`
- Railway API: `b13d51ff-76f9-4938-ac3d-7a444f738761`
- Railway mobile: `ab85dfc4-5fe9-4903-b43f-11675b094cf5`
- Railway Expo Go: `d3be6454-355f-46e5-887c-c60ec1da90a8`

## 검증

- 웹 `yarn verify`: ESLint, TypeScript, Vite production build(4,148 modules) 성공.
- 모바일 `yarn verify`: lint, typecheck, 5 tests, Expo web export 성공.
- Spring `./gradlew test`, FastAPI 24 tests, AI 4 tests, Go canvas/serve tests 성공.
- staging cloud Playwright 7/7 성공: 인증/CORS, 환경 분리, 첫 획 저장·reload, 팔레트, 저장 아이콘, 좌하단 좌표, 1.1MB 멱등 저장, Socket.IO, 복수 기간 일정, 반응형.
- staging/production 웹·API·모바일 health·Expo manifest 모두 200이며 Expo 자산은 각 환경 도메인에 호스팅된다.
- Vercel, mobile WAS, Expo 번들은 staging에는 staging API만, production에는 production API만 포함한다.
- Railway 양 환경 변수와 로컬 `.env`에 로컬/LAN 목적지가 없음을 비밀값 비노출 방식으로 확인했다.
- 최근 30분 HTTP 5xx는 staging/production 모두 0건, production 499는 0건이다.

## 499 분석

staging 499 6건은 cloud E2E 페이지 전환 시각에 발생했다. Socket.IO 1ms 2건과 diary/schedule/tasks GET 87~93ms 4건이며 모두 Railway `client has closed the request before the server could send a response`다. 브라우저 context 종료에 따른 정상 취소이고 서버 오류나 저장 재시도가 아니다.

## 시각 확인

- [desktop](./2026-09-09-canvas-desktop.png)
- [iPad](./2026-09-09-canvas-ipad.png)
- [mobile](./2026-09-09-canvas-mobile.png)

## 로컬 Docker 생략

cloud-only 전환 요청에 따라 `docker-compose.yml`을 제거했고 기존 컨테이너는 볼륨 삭제 없이 종료했다. `docker compose up -d --build`는 실행 대상이 없어 생략하고 Railway staging Docker 빌드와 실제 cloud E2E를 통합 검증 기준으로 사용했다.
