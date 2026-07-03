# 1. uv가 설치된 공식 이미지를 사용하면 편리합니다.
FROM ghcr.io/astral-sh/uv:python3.12-alpine

WORKDIR /app

# uv 설정: 바이트코드 사전 컴파일, 마운트 대신 복사 링크 모드
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# 2. 의존성 파일 먼저 복사 (캐싱 효율화)
COPY pyproject.toml uv.lock ./

# 3. uv.lock을 고정해 재현 가능한 의존성 설치 (프로젝트 자체는 빌드 백엔드가 없어 제외, dev 그룹 제외)
RUN uv sync --frozen --no-install-project --no-dev

# 4. 소스 코드 복사
COPY . .

# 5. FastAPI 실행 (venv의 uvicorn 사용, app.main:app이 Socket.IO ASGI 앱)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
