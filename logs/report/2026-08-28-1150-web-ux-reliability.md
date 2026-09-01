# 웹 UX 신뢰성 개선 결과

## 범위

- `flownote/` 홈, 로그인, 회원가입, Blog 목록·편집기, Canvas 도구막대, Header, Planner 일정 폼
- API 계약이나 백엔드 구현은 변경하지 않았다.

## 구현

- 동작하지 않는 홈·로그인 컨트롤 제거 및 실제 기능 검색 추가
- 회원가입 비동기 성공·실패 처리
- Blog 조회 오류 전파와 명시적 오류 상태
- Blog 자동 저장 제한 재시도, backoff, 상태 표시, 수동 복구
- 모바일 노트·Canvas 도구 재배치
- 헤더 메뉴, 사이드바, 드로잉 모달 키보드 접근성 보완
- Playwright UX 회귀 테스트 6개 추가

## 검증 및 배포

- `yarn lint`: 성공
- `yarn build`: 성공, Vite 4,145개 모듈 변환
- Playwright: 16개 전체 성공
- 390px 모바일, 820px 태블릿, 1440px 데스크톱 재확인: 문서 가로 overflow 없음
- 최초 `docker compose up -d --build`: 다른 프로젝트의 `village-finance-redis`가 호스트 6379를 사용해 Redis 기동 실패
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 전체 서비스 기동 성공
- 로컬 `http://127.0.0.1:5173/`, `http://127.0.0.1:8000/`, Spring actuator: HTTP 200
- Vercel production deployment: `dpl_53ZAYZA2otAuHmaLaWYEXBeXVS8B`, READY
- Production URL: `https://flownote-react.vercel.app`, HTTP 200
- Production 모바일 브라우저 확인: 새 홈 제목 `작업을 선택하세요` 렌더링, 가로 overflow 0
- Railway: 백엔드 소스와 실행 산출물이 변경되지 않아 재배포하지 않음
