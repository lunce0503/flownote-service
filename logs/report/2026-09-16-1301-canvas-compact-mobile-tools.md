# Canvas 협소 화면 도구 UI

## 변경

- `lg` 미만 화면의 도구 행은 되돌리기, 현재 도구 아이콘, 펼치기 버튼만 기본 표시한다.
- 펼친 목록에서 펜, 지우개, 올가미, 이동, 텍스트, 이미지 추가를 선택한다.
- 도구 선택, 이미지 선택, 바깥 터치, `Escape` 입력 후 목록을 닫는다.
- 펜 선택 후 색상 팔레트를 여는 기존 동작과 데스크톱 툴바는 유지한다.

## 검증

- `cd flownote && yarn typecheck`: 통과
- `cd flownote && yarn lint`: 통과
- `cd flownote && yarn build`: 통과
- `cd flownote && yarn e2e --list`: 10개 테스트 등록 확인
- 390px 모바일 도구 접힘·펼침·선택 회귀 테스트를 클라우드 E2E에 추가했다.

## 배포

- `node scripts/deploy-cloud.mjs release web`으로 staging-first 배포를 완료했다.
- 첫 staging E2E에서는 배포 직후 첫 Canvas 화면이 빈 문서로 로드돼 저장 시나리오 하나가 실패했다. 동일 시나리오를 현재 staging에서 재실행해 통과한 뒤 전체 release를 다시 검증했다.
- 최종 staging E2E 10개가 모두 통과했다.
- staging deployment: `dpl_HrYGFk84TCULtWJfEHjsPuyifDBz` (`READY`)
- production deployment: `dpl_8tebWR83WVVzS4wgRGowT71HeXFJ` (`READY`)
- staging과 production canonical URL은 모두 HTTP 200을 반환했다.
- 검증·배포 fingerprint: `45b04063f2b73332e3e62f344a588e4a167186441c0902ce11c319eef494e999`
