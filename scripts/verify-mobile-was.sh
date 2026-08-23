#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/verify-services.sh" mobile

echo "== Verify Spring mobile contract =="
(
  cd "$ROOT_DIR/flownote-server"
  ./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest
)

echo "== Verify Compose configuration =="
(cd "$ROOT_DIR" && docker compose config --quiet)

echo "Mobile WAS verification passed."
