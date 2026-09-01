# 개발 중 기능 메뉴 비노출

## 변경 요약

- `Magic`, 나사 퍼즐, 밴픽, 주식 capability를 `development` 단계로 지정했다.
- 네 capability의 라우트는 개발 확인을 위해 `enabled: true`로 유지했다.
- `nav: false`와 매니페스트 기반 공개 여부 함수를 사용해 헤더 기타 메뉴, 사이드바, 프로필 메뉴에서 관련 링크를 제거했다.
- 설정과 관리자 메뉴는 매니페스트의 `nav` 값과 실제 노출이 일치하도록 정리했다.
- 제품 관점과 프론트엔드 기준 문서에 개발 중 기능의 라우트/메뉴 정책을 기록했다.

## 검증

- `cd flownote && yarn lint`: 성공.
- `cd flownote && yarn typecheck`: 성공.
- `cd flownote && yarn build`: 성공.
- Playwright Chromium 컨테이너 `navigation-visibility.spec.ts`: 1개 성공.
- 운영 브라우저 확인: 기타 메뉴에는 소셜, 에이전트, 플래너, 설정만 표시되고 `/magic`, `/screw-puzzle`, `/banpick`, `/stocks`, `/stocks/chart` 링크는 0개였다.
- 호스트 Playwright는 기존 root 소유 Vite 캐시와 `libatk-1.0.so.0` 부재로 실행할 수 없어 Playwright 공식 컨테이너로 검증했다.
- `REDIS_HOST_PORT=6380 docker compose up -d --build`: 전체 이미지 빌드와 백그라운드 기동 성공.
- 로컬 헬스체크: React 200, Gateway 200, Spring actuator `UP`.

## 배포

- Vercel project: `flownote-react`.
- Deployment ID: `dpl_8vXiSKu8VJa9Cpyc2baSBzMCv4F5`.
- Deployment URL: `https://flownote-react-o0o2iesbq-flownote-service.vercel.app`.
- Production alias: `https://flownote-react.vercel.app`.
- 상태: `READY`.
- Railway: 백엔드 코드와 API 계약이 변경되지 않아 재배포하지 않았다.

## Git 상태

- 현재 브랜치: `docs/canvas-code-map`.
- 이번 변경을 포함한 작업 트리는 아직 커밋하거나 푸시하지 않았다.
- 기존 Canvas와 Blog 관련 미커밋 변경은 유지했으며 되돌리지 않았다.
