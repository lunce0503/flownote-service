# 캔버스 부하 분리: Railway flownote-canvas 서비스 신설

- 일시: 2026-07-11 14:33 (로컬)
- 배경: 네트워크 불안정 증상에 대해 메인 서버 기능 분리 요청. 기능별 평가 결과 캔버스 계열(실시간 스트로크 저장·자산 프록시·스토리지 워커)만 분리 효용이 있어, **코드 분리 없이 같은 Spring 이미지를 전용 인스턴스로 복제**하고 캔버스 트래픽만 라우팅하는 방식 채택.

## 변경 내용

### 코드 (flownote-API, 최소 수정)
- `app/core_api.py`: `forward_request()`에 `base_url` 선택 파라미터 추가(기본값 기존 `CORE_API_BASE_URL` — 다른 호출부 무영향).
- `app/canvas_socket.py`: `CANVAS_API_BASE_URL` 환경 변수 신설(미설정 시 `CORE_API_BASE_URL` 폴백). 캔버스 소켓 중계의 3개 호출 경로(`_forward_json`, `_forward_json_cancellable`, 자산 업로드)가 이 값을 사용.
- **로컬 compose는 변수 미설정이라 동작 변화 없음.**

### 인프라 (Railway/Vercel, 코드 외)
- Railway `flownote-canvas` 서비스 신설(id `a2eda8f1-83ea-422f-a844-3749f8e00227`), `flownote-server/` 동일 소스 배포.
- 변수 18개를 전부 `${{flownote-main.KEY}}` **참조 변수**로 연결 — 시크릿 원본은 flownote-main 한 곳 유지(로테이션 시 자동 동기화). DB·Redis·스토리지 공유.
- 공개 도메인: https://flownote-canvas-production.up.railway.app (port 8080).
- `flownote-api`에 `CANVAS_API_BASE_URL=http://flownote-canvas.railway.internal:8080`(사설망) 설정 후 재배포(`8734bf36`).
- Vercel `VITE_CANVAS_API_URL`(Production) → flownote-canvas 공개 도메인으로 교체, 프론트 재배포 `dpl_EsM7mJeWFJcYJkDEwDUQbSCpNhzz`.

## 안전성 근거

- **스토리지 워커 다중 인스턴스**: `canvas_storage_jobs`를 `FOR UPDATE SKIP LOCKED`로 선점하므로 두 인스턴스가 떠도 중복 처리 없음.
- **Flyway 동시 기동**: DB 락 기반이라 안전. flownote-canvas 기동 시 v21 검증 통과.
- **인증**: 세션이 공유 DB(`app_sessions`)에 있어 어느 인스턴스로 가도 동일.
- 진단 결과 3:20 야간 보존 잡이 두 번 돌 수 있으나 멱등 삭제라 무해.

## 검증

| 항목 | 결과 |
| --- | --- |
| FastAPI `uv run pytest` | 12 passed |
| `REDIS_HOST_PORT=6380 docker compose up -d --build` | 8개 컨테이너 Up (로컬 동작 불변) |
| flownote-canvas 배포 | SUCCESS, `/actuator/health` UP |
| 라우팅 증명 | `GET /api/canvas/metadata` → 401(인증 요구) — 캔버스 API가 새 인스턴스에서 서빙 |
| flownote-api 재배포 | SUCCESS, `/` 200 |
| Vercel 재배포 | READY, https://flownote-react.vercel.app 200 |
| flownote-main | health UP (기존 트래픽 무영향) |

## 남은 관찰 항목

- 실사용 트래픽에서 flownote-canvas CPU/응답시간과 flownote-main 부하 감소 폭 확인(Railway 메트릭, 며칠 관찰 권장).
- 근본 증상(네트워크 불안정)이 부하 원인이 아닐 가능성 — 증상 재발 시 Railway 리전 왕복/소켓 재연결 로그 진단 필요.
- 다음 단계 후보: `FLOWNOTE_STORAGE_PUBLIC_BASE_URL` 직접 서빙으로 이미지 프록시 부하 제거(설정만으로 가능), replica 확장.
- FastAPI 변경(core_api/canvas_socket)은 미커밋 — 커밋 시 `feat/agent-note`가 아닌 백엔드 라우팅 성격 브랜치 결정 필요.
