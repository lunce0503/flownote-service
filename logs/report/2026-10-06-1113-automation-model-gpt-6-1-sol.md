# 자동화 모델 변경

- 요청: Flownote 자동화 모델을 `gpt-6.1-sol`로 변경.
- 영향 범위: `automation/codex/` 서버 자동화 스크립트, 회귀 테스트, 운영 안내서. 앱·백엔드 실행 산출물은 변경하지 않음.
- 분석 runner와 Gmail notifier의 `CODEX_MODEL`을 모두 `gpt-6.1-sol`로 고정. 기본 프로필과 OpenAI 로그인 인증 경로는 유지.
- 설치된 `~/.local/bin/` 명령은 저장소 소스를 가리키는 symlink이므로 다음 실행부터 즉시 적용됨.
- 공식 OpenAI 문서에서 대상 모델 ID와 지원 reasoning effort를 확인. 현재 기본 effort `high`는 지원 범위에 있음: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- 검증: `automation/codex/tests/run-tests.sh` 12 passed, 0 failed. 분석·메일 알림·컨테이너 실행 인자 및 metadata의 모델 값을 검증.
- 검증: runner와 notifier의 `bash -n` 통과. 설치된 실행 파일에서 새 모델 값 확인. weekly/feedback timer 모두 active.
- 실제 모델 API 호출 및 이메일 재발송은 이번 설정 변경 검증에서 실행하지 않음.
- 클라우드 배포 생략: 서버 자동화 설정 변경이며 Vercel/Railway 앱 실행 산출물에 영향 없음. 배포 명령은 필요하지 않음.
