#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/verify-services.sh" mobile

echo "== Verify Spring mobile contract =="
(
  cd "$ROOT_DIR/flownote-server"
  ./gradlew test --tests com.flownote.mobile.MobileConfigControllerTest
)

echo "== Verify cloud configuration =="
node "$ROOT_DIR/scripts/check-cloud-config.mjs"

echo "Mobile WAS verification passed."
