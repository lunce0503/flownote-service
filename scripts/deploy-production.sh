#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Production always follows deployment and verification of the same source in staging.
exec node "$ROOT_DIR/scripts/deploy-cloud.mjs" release "${1:-all}"
