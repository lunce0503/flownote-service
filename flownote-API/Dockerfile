# 1. uv가 설치된 공식 이미지를 사용하면 편리합니다.
FROM ghcr.io/astral-sh/uv:python3.12-alpine

WORKDIR /app

RUN apk add --no-cache \
    postgresql-dev \
    gcc \
    musl-dev \
    libffi-dev

# 2. 의존성 파일 먼저 복사 (캐싱 효율화)
COPY pyproject.toml uv.lock ./

# 3. 의존성 설치 (가상환경 없이 시스템에 설치하여 컨테이너 최적화)
RUN uv pip install --system --no-cache -r pyproject.toml

# 4. 소스 코드 복사
COPY . .

# 5. FastAPI 실행 (이미지상 app 폴더 내 main.py가 있다고 가정)
# 만약 실행 파일 위치가 다르다면 app.main:app 등으로 수정하세요.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]