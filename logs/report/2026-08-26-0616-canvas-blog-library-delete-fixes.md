# Canvas·Blog 라이브러리와 삭제 동작 개선

## 변경 요약

- 올가미 삭제가 `deleted` 상태를 `modified`로 덮어쓰던 오류를 수정했다.
- 지우개와 올가미가 새 요소 제거/기존 요소 tombstone 규칙을 공유하도록 통합했다.
- 텍스트 박스 입력을 `Enter` 확정, `Shift+Enter` 줄바꿈, `Escape` 취소로 단순화했다.
- Canvas 상세의 폴더 팝업을 제거하고 `/canvas` 상위 목록 버튼을 추가했다.
- Canvas 폴더 CRUD와 드래그 이동을 `/canvas` 목록으로 이전했다.
- Blog 상세 URL을 제목 기반 `/blog/:title`에서 ID 기반 `/blog/:noteId`로 변경했다.
- Canvas와 Blog 목록을 `최근 → 카테고리별 폴더 → 폴더 없음` 순서와 공통 정렬 함수로 통일했다.
- Canvas 코드맵과 아키텍처/프론트엔드 기준 문서를 갱신했다.

## 검증

- `cd flownote && yarn lint`: 성공.
- `cd flownote && yarn build`: 성공.
- Playwright Chromium E2E: 9개 성공. 삭제 payload, 텍스트 UX, ID 라우팅, 목록 정렬, 모바일 390px overflow를 포함한다.
- Playwright 스크린샷: Canvas/Blog 데스크톱 1440px, 모바일 390px에서 겹침과 수평 넘침이 없음을 확인했다.
- `git diff --check`: 성공.
- 최초 `docker compose up -d --build`: 모든 이미지 빌드 성공, 기존 `village-finance-redis`의 호스트 6379 점유로 기동 실패.
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 전체 서비스 기동 성공.
- 로컬 확인: React `/` 200, Canvas `/health` `ok`, Spring actuator `UP`, gateway `/api/capabilities` 200.

## 배포

- Vercel project: `flownote-react`.
- Deployment ID: `dpl_12Bi7vcnj9wDNLoFUUVqchYEPTQD`.
- Deployment URL: `https://flownote-react-hvq975ulm-flownote-service.vercel.app`.
- Production alias: `https://flownote-react.vercel.app`.
- 상태: `READY`.
- 배포 후 `/`, `/canvas`, `/blog/recent-note`: 모두 HTTP 200.
- Railway: 백엔드 코드와 API 계약 구현이 바뀌지 않아 재배포하지 않았다. 기존 HTTP/Socket.IO 계약을 사용하는 프론트 변경이다.

## 남은 운영 참고

- 로컬 기본 포트 6379는 `village-finance-redis`가 사용 중이다. 통합 실행 시 `REDIS_HOST_PORT=6380`을 사용한다.
- 모바일 이미지의 기존 npm 의존성 감사 결과가 27건 표시됐으나 이번 웹 변경 범위에는 포함하지 않았다.
