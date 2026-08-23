# flownote-ai Docker 가상환경 덮어쓰기

## 증상

- `docker compose up -d --build` 자체는 exit code 0으로 끝나지만 `ai-server`가 `Restarting (127)` 상태를 반복한다.
- `http://localhost:8010/` 연결이 거부된다.
- 컨테이너 로그에는 `sh: uvicorn: not found`가 반복된다.

## 원인

`flownote-ai/Dockerfile`은 `uv sync`로 `/app/.venv`를 정상 생성한 뒤 `COPY . .`를 실행한다. `flownote-ai/`에는 `.dockerignore`가 없어서 호스트의 `.venv`도 이미지에 복사되고, 앞 단계에서 만든 컨테이너 가상환경을 덮어쓴다.

이미지 안 `/app/.venv/bin/uvicorn`의 shebang은 다음 호스트 경로를 가리킨다.

```text
#!/home/kwon/Flownote/service/flownote-ai/.venv/bin/python
```

이 경로는 컨테이너에 없으므로 셸이 `uvicorn`을 실행하지 못하고 exit 127로 종료한다. 같은 Docker 패턴을 사용하는 `flownote-API`는 `.dockerignore`에서 `.venv`를 제외하므로 이미지 안 shebang이 `#!/app/.venv/bin/python`으로 유지되고 정상 기동한다.

## 수정 방향

1. `flownote-ai/.dockerignore`를 추가하고 최소한 `.venv`, `__pycache__`, `*.pyc`, `.env`, `.env.*`, `*.log`를 제외한다.
2. `docker compose build --no-cache ai-server` 후 이미지를 다시 만든다.
3. `docker compose up -d ai-server` 후 컨테이너 상태와 `http://localhost:8010/` 응답을 확인한다.
4. 변경 시 `flownote-ai` Railway 서비스도 배포하고 healthcheck `/`를 확인한다.

## 재현 및 확인 명령

```bash
docker compose up -d --build
docker compose ps ai-server
docker compose logs --tail=120 ai-server
docker run --rm --entrypoint sh service-ai-server -c 'head -n 1 /app/.venv/bin/uvicorn'
```

## 해결

- `flownote-ai/.dockerignore`에 `.venv`, Python 캐시, 환경 변수 파일, 로그와 빌드 생성물을 제외하도록 추가했다.
- Docker가 `uv sync`로 만든 `/app/.venv`를 호스트 파일로 다시 덮지 않으므로 `uvicorn`의 shebang이 컨테이너 경로를 유지한다.
