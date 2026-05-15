# 검증 매트릭스

| 하위 프로젝트 | 주요 검사 | 메모 |
| --- | --- | --- |
| `flownote/` | `yarn build` | `flownote/`에서 실행한다. |
| `flownote-next/` | `yarn lint`, `yarn build` | `flownote-next/`에서 실행한다. |
| `flownote-API/` | `uv run ...` | 사용 가능한 app/test entry point에 맞는 구체 명령을 선택한다. |
| `flownote-server/` | `./gradlew test` | `flownote-server/`에서 실행한다. |
| 루트 오케스트레이션 | Docker Compose 점검 | 서비스 연결이 바뀔 때만 검증한다. |

검증을 생략하면 이유와 나중에 실행해야 할 명령을 기록한다.
