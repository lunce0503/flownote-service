# 캔버스 사용자 피드백 반영

## 대상 피드백

- 새 카테고리·폴더·캔버스가 서버 응답 전에 화면에 보이도록 한다.
- 캔버스 상세 화면에서 제목을 수정한다.
- 한 캔버스의 선택 요소를 다른 캔버스에 복사·붙여넣기한다.
- 이미지와 PDF를 캔버스에서 편집한다.
- 목록 이동과 실행 취소 버튼을 명확히 구분한다.

## 변경 내용

- 목록 생성에 임시 ID 기반 낙관적 표시, 성공 시 실제 ID 교체, 실패 시 롤백을 추가했다.
- 툴바 제목을 인라인 편집하고 기존 문서 PATCH API로 저장한다.
- 올가미 클립보드를 컴포넌트 지역 상태에서 SPA 세션 저장소로 옮겼다.
- PDF.js로 PDF를 최대 30개의 페이지 이미지로 변환하고 기존 이미지 편집 흐름에 연결했다.
- 목록 이동 버튼을 호박색 사각 격자 버튼으로 바꾸고 실행 취소는 원형 회전 버튼으로 유지했다.
- 클라우드 E2E에 제목 영속화, 버튼 구분, 낙관적 생성, 문서 간 붙여넣기 계약을 추가했다.

## 검증

- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn typecheck`: 통과
- `cd flownote && yarn build`: 통과
- `cd flownote && yarn playwright test --list`: 14개 테스트 수집

## 배포

- 소스 지문: `ffa053d748d2a5913894caf608fcabef871f74550dbe0249907b52abe2ff134a`
- 스테이징 Vercel: `dpl_GzFWyY2b7MqTFQUqM514tDSHRCz7` (`READY`)
- 스테이징 클라우드 E2E: PDF 실제 변환·저장 검증을 포함한 15개 모두 통과
- 프로덕션 Vercel: `dpl_3WkMx2NwcQgRdt4bhnNhMSKQG1Sa` (`READY`)
- 스테이징 canonical URL: `https://flownote-react-staging.vercel.app/` HTTP 200
- 프로덕션 canonical URL: `https://flownote-react.vercel.app/` HTTP 200
- 백엔드 계약 변경이 없어 Railway 서비스 코드는 재배포하지 않았다.
