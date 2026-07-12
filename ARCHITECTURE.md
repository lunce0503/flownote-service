# 개요



# 시스템 구성 (조감도)

Flownote는 기획한 내용을 바탕으로 관련 필기를 텍스트와 그림으로 표현하여 새로운 아이디어를 만들거나 기존의 내용을 정리하며 지식을 정리하게 돕는 노트이다. 
주된 기능은 그림판(Canvas)과 작성 영역(Text Pad)이며 부가적인 기능을 이용하여 그림판과 작성영역과의 유기적인 조합을 이루는 방식으로 개발되었다. 
그림판은 연필이나 펜을 통해 작성하는 방식을 말하며 이는 고전적인 필기를 중심으로 작성되는 기능이다. 이 기능을 주요 작성 방법으로 정하면 대상의 연결성과 높은 직관력을 가지는 시각적 표현의 장점을 이용하는 곳으로 주로 구상이나 이해를 중시할 때 작성되는 방식이다. 
작성 영역은 키보드와 같은 타이핑 기기를 통해 작성되는 기능을 말하며, 이를 주된 작성법으로 정하면 엄밀하게 정의되어야 하거나 정보의 오류가 없어야 하는 내용을 담는 것이 주된 내용이 된다. 그리고 그림판 기능과 달리 단방향으로 작성하기 때문에 시간을 기반으로 하는 정보를 작성하는데 용이하다. 
위의 주된 기능을 바탕으로 작성하는 내용을 기록하는데 불편함을 겪는 경우에 이용하는 것이 부가적인 기능이다. 텍스트나 선 데이터를 가지고 표현하기 어려운 경우, 사용자가 해당되는 지식을 나타내는 것이 어려운 경우나 실시간으로 변하는 값을 이용하는 경우와 같이 어려움을 갖는 경우에 사용하는 기능이다. 

# 코드맵

## `flownote/` : flownote의 프론트엔드를 다루는 곳
## `flownote/src` : flownote의 프론트와 직접관련된 소스 코드를 작성하는 곳으로 FSD 방식으로 코드를 작성하는 것을 주로 둔다.
### `flownote/src/app`: flownote 프론트엔드의 가장 최상위 폴더로 실제 렌더링을 할때 마지막으로 거쳐야하는 곳이다.

### `flownote/src/entities`: flownote 기능 중 비지니스 모델과 관련된 내용을 다루는 곳으로  
### `flownote/src/features`: 
### `flownote/src/pages`: 
### `flownote/src/shared`: 
### `flownote/src/widgets`: 

### `flownote-mobile/` : flownote의 IOS/Android 앱을 다루는 곳
### `flownote-next/` : `flownote/`에서 클라이언트가 요청한 데이터를 가공해 전송하는 서버
### `flownote-server/` : flownote 서버스의 메인 서버로 주로 캔버스/텍스트 패드 데이터 저장, 로그인 인증, 이외의 다양한 기능의 데이터를 다루는 서버이다.
### `flownote-API/` : flownote API 라우터로 flownote의 여러 마이크로서비스를 연결하는 api를 관리하는 서버

## 하위 서버 아키텍쳐

| 경로 | 역할 | 주요 책임 |
| --- | --- | --- |
| `flownote/` | Vite React 웹 앱 | 작업, 노트, 캔버스, 소셜, 주식 등 주요 사용자 화면 |
| `flownote-next/` | Next.js 앱 | Next app-router 기반 화면, API, Prisma/PostgreSQL 기능 |
| `flownote-API/` | FastAPI 서비스 | 메인 에이전트(Gemini), 실시간 캔버스 소켓 중계, 에이전트 노트(내부망 Ollama 이미지 검색), 주식 시세 |
| `flownote-server/` | Spring Boot WAS | 인증, 사용자 소유 데이터, 작업/노트/캔버스 저장, 모바일 설정 API |
| `flownote-mobile/` | Expo 모바일 앱 | Spring WAS 설정을 읽어 WebView로 웹 앱을 여는 모바일 진입점 |
| `db` (PostgreSQL) | 관계형 DB · :5432 | Spring 소유 데이터 · Next Prisma 데이터 |
| `redis` (Redis) | 캐시 · :6379 | Spring 캔버스 상태 캐시(TTL) |
| `ollama` (Ollama) | 내부망 LLM · :11434 | gemma4:e2b(멀티모달) + embeddinggemma, 에이전트 노트 추론(클라우드 미배포) |
| `docker-compose.yml` | 로컬 통합 실행 | 위 앱·서버·인프라를 함께 실행 |

## 서비스 경계

- 사용자 인증과 사용자 소유 데이터의 기준은 `flownote-server`다.
- React 웹 앱은 `VITE_CORE_API_URL`로 Spring API를 호출하고, `VITE_AI_BASE_URL` 또는 `VITE_API_BASE_URL`로 FastAPI 기능을 호출한다.
- Next.js 앱은 Prisma/PostgreSQL을 사용하는 독립 흐름을 담당하되, 공통 DB 계약이 바뀌면 Spring과 함께 확인한다.
- 모바일 앱은 `EXPO_PUBLIC_WAS_URL`의 `/api/mobile/config`를 시작점으로 사용한다.
- DB 스키마 기준은 Spring Flyway 마이그레이션이며, 문서가 실제 마이그레이션과 다르면 마이그레이션을 우선한다.
- 실시간 캔버스는 React ↔ FastAPI Socket.IO로 연결되고, FastAPI가 스트로크/이미지/텍스트를 Spring 캔버스 API에 중계·저장한다. Spring은 Redis로 캔버스 상태를 캐시한다.
- 프로덕션에서는 캔버스 부하 분리를 위해 같은 Spring 이미지를 `flownote-canvas` 인스턴스로 하나 더 배포하고, 캔버스 트래픽만 그쪽으로 보낸다. 라우팅 지점은 두 곳이다: FastAPI `CANVAS_API_BASE_URL`(캔버스 소켓 중계 전용, 미설정 시 `CORE_API_BASE_URL` 폴백)과 프론트 `VITE_CANVAS_API_URL`(캔버스 HTTP 전용). DB·Redis·스토리지는 flownote-main과 공유하며, 스토리지 워커는 `FOR UPDATE SKIP LOCKED` 선점이라 다중 인스턴스에서 안전하다.
- 에이전트 노트는 FastAPI가 내부망 Ollama(`OLLAMA_BASE_URL`)로 이미지를 캡션→임베딩→유사 검색한다. Ollama와 이 기능은 내부망 전용이며 클라우드에 배포하지 않는다.
- 메인 플래너 에이전트는 FastAPI가 외부 Google Gemini API로 MCP 도구를 호출하되, 최종 저장은 항상 Spring Core API를 거친다.
- 주식 시세는 Spring이 FastAPI `/api/market`(`STOCK_MARKET_DATA_URL`)을 호출해 받는다.

## 배포 토폴로지

로컬은 `docker-compose.yml`로 통합 실행하고, 프로덕션은 프론트=Vercel, 백엔드=Railway로 나뉜다. Ollama·에이전트 노트는 내부망 전용으로 클라우드에 올리지 않는다.

| 하위 프로젝트 | 프로덕션 대상 | 비고 |
| --- | --- | --- |
| `flownote/` (Vite) | Vercel `flownote-react` | 빌드타임 `VITE_*` 주입 |
| `flownote-next/` | Vercel `flownote-next` | Next.js |
| `flownote-API/` | Railway `flownote-api` | Socket.IO(wss), health `/` |
| `flownote-server/` | Railway `flownote-main` | health `/actuator/health` |
| `flownote-server/` (캔버스 전담) | Railway `flownote-canvas` | 같은 이미지 2호기, `/api/canvas/**` 트래픽 전담, 변수는 flownote-main 참조 |
| PostgreSQL · Redis | Railway 관리형 | 사설 네트워크 |
| Ollama · 에이전트 노트 | 배포 안 함 | 내부망 전용 |

내부망은 3계층으로 배선한다: 컨테이너 간 docker DNS(`spring-server:8080`, `api-server:8000`, `ollama:11434`), 실기기 접근용 `HOST_LAN_IP`(LAN), 프로덕션 public HTTPS.

## 코드 처리 단계

1. 요청을 하위 프로젝트와 파일에 매핑한다.
2. 주변 타입, API 응답 형태, 환경 변수, 호출부를 먼저 읽는다.
3. 기존 로컬 패턴에 맞춰 가장 좁은 변경을 적용한다.
4. 사용자에게 보이는 흐름은 로딩, 빈 상태, 오류 상태를 함께 고려한다.
5. 변경한 하위 프로젝트의 가장 작은 검증 명령을 실행한다.
6. 작업 종료 전 루트에서 `docker compose up -d --build`로 통합 실행을 확인한다.

## 기록 위치

| 경로 | 용도 | 기록 기준 |
| --- | --- | --- |
| `logs/bugs/` | 재현 가능한 런타임 오류와 사용자 제보 버그 | 증상, 재현 경로, 원인, 수정 방향 |
| `logs/` | 실행 로그 요약과 운영 증상 | 비밀값을 제거한 핵심 로그와 관찰 결과 |
| `logs/report/` | 리뷰, 감사, 배포 결과, 큰 작업 요약 | 다시 읽을 가치가 있는 분석 산출물 |
| `.codex/memories/` | 안정적인 프로젝트 컨벤션 후보 | 반복 적용할 수 있는 장기 지식 |
| `docs/` | 제품, 설계, 품질, 보안, 신뢰성 문서 | 코드와 운영 기준을 설명하는 장기 문서 |

`logs/`와 `logs/report/`는 소스 코드의 근거를 대체하지 않는다. 코드와 문서가 충돌하면 소스 코드, 마이그레이션, 실행 가능한 검증 결과를 우선한다.

## 검증 기준

- `flownote/`: `yarn build`
- `flownote-next/`: `yarn lint`, `yarn build`
- `flownote-API/`: `uv run ...`
- `flownote-server/`: `./gradlew test`
- 루트 통합: `docker compose up -d --build`

검증 실패는 실패한 명령, 핵심 오류, 영향 범위, 다음 조치를 함께 기록한다.
