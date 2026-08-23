#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"

run_web() {
  echo "== Verify Vite web =="
  (cd "$ROOT_DIR/flownote" && yarn build)
}

run_api() {
  echo "== Verify FastAPI gateway =="
  (cd "$ROOT_DIR/flownote-API" && uv run pytest -q)
}

run_main() {
  echo "== Verify Spring main =="
  (cd "$ROOT_DIR/flownote-server" && ./gradlew test)
}

run_go_tests() {
  local service_dir="$1"
  if command -v go >/dev/null 2>&1; then
    (cd "$service_dir" && go test ./...)
    return
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "Go CLI와 Docker가 없어 Go 테스트를 실행할 수 없습니다." >&2
    exit 1
  fi
  docker run --rm \
    -v "$service_dir:/app" \
    -w /app \
    golang:1.23 \
    go test ./...
}

run_canvas() {
  echo "== Verify Go canvas =="
  run_go_tests "$ROOT_DIR/flownote-canvas"
}

run_serve() {
  echo "== Verify Go serve =="
  run_go_tests "$ROOT_DIR/flownote-serve"
}

run_ai() {
  echo "== Verify FastAPI AI =="
  (cd "$ROOT_DIR/flownote-ai" && uv run pytest -q)
}

run_mobile() {
  echo "== Verify Expo mobile =="
  (cd "$ROOT_DIR/flownote-mobile" && yarn verify)
}

run_target() {
  case "$1" in
    web) run_web ;;
    api) run_api ;;
    main) run_main ;;
    canvas) run_canvas ;;
    serve) run_serve ;;
    ai) run_ai ;;
    mobile) run_mobile ;;
    *)
      echo "Unknown target: $1" >&2
      echo "Usage: $0 [all|web|api|main|canvas|serve|ai|mobile]" >&2
      exit 2
      ;;
  esac
}

if [[ "$TARGET" == "all" ]]; then
  for target in web api main canvas serve ai mobile; do
    run_target "$target"
  done
  echo "== Verify Compose configuration =="
  (cd "$ROOT_DIR" && docker compose config --quiet)
else
  run_target "$TARGET"
fi

echo "Verification passed: $TARGET"
