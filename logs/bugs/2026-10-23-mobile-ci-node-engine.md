# 공통 CI의 모바일 Node engine 불일치

- 증상: Quality Gates의 mobile job이 `flownote-mobile`에서 `yarn install --frozen-lockfile --non-interactive`를 실행하면 `@react-native/dev-middleware@0.81.5`의 Node engine 검사에서 실패하고 `yarn verify`에 도달하지 못한다.
- 원인: 의존성은 Node >=20.19.4를 요구하지만 `.github/workflows/mobile-was.yml`의 mobile job은 20.19.0에 고정돼 있었다.
- 기존 실패: https://github.com/lunce0503/flownote-service/actions/runs/39923552425 (편입 전에도 같은 설치 단계의 실패 이력이 있다).
- 수정: mobile job의 Node를 최소 요구 버전 20.19.4로 변경한다. 다른 모바일 소스·lockfile·진행 중인 앱 변경은 포함하지 않는다.
- 검증: 수정 커밋의 Quality Gates에서 모바일 의존성 설치와 `yarn verify`, 전체 job 결과를 확인한다. 최종 run ID와 결과는 해당 작업의 `logs/report/`에 남긴다.
