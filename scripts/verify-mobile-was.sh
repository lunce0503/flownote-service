#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
FAILED_STEPS=()

run_step() {
  local name="$1"
  shift

  echo "== $name =="
  if ! "$@"; then
    FAILED=1
    FAILED_STEPS+=("$name")
  fi
}

run_step "mobile static verification" bash -lc "cd '$ROOT_DIR/flownote-mobile' && yarn verify"

run_step "compose configuration" bash -lc "cd '$ROOT_DIR' && docker compose config --services"

echo "== mobile lockfile =="
if [ ! -f "$ROOT_DIR/flownote-mobile/yarn.lock" ]; then
  echo "flownote-mobile/yarn.lock is missing. Run 'cd flownote-mobile && yarn install' and commit the lockfile." >&2
  FAILED=1
  FAILED_STEPS+=("mobile lockfile")
fi

echo "== spring mobile contract test =="
if ! command -v java >/dev/null 2>&1; then
  echo "java is not available. Install Java 17 and set JAVA_HOME before running Spring tests." >&2
  FAILED=1
  FAILED_STEPS+=("spring mobile contract test")
else
  run_step "spring mobile contract test" bash -lc "cd '$ROOT_DIR/flownote-server' && ./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest"
fi

echo "== expo typecheck =="
if [ ! -d "$ROOT_DIR/flownote-mobile/node_modules" ]; then
  echo "flownote-mobile/node_modules is missing. Run 'cd flownote-mobile && yarn install' before typecheck." >&2
  FAILED=1
  FAILED_STEPS+=("expo typecheck")
else
  run_step "expo typecheck" bash -lc "cd '$ROOT_DIR/flownote-mobile' && yarn typecheck"
fi

if [ "$FAILED" -eq 0 ]; then
  echo "All mobile WAS verification gates passed."
else
  echo "Mobile WAS verification failed: ${FAILED_STEPS[*]}" >&2
fi

exit "$FAILED"
