#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-all}"
SKIP_VERIFY="${SKIP_VERIFY:-false}"
RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
RELEASE_MESSAGE="${RELEASE_MESSAGE:-Deploy $(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
RAILWAY_AGENT_SESSION="${RAILWAY_AGENT_SESSION:-flownote-deploy-$(date +%s)-$$}"

case "$TARGET" in
  all|web|api|main|canvas|serve|ai|mobile) ;;
  *)
    echo "Usage: $0 [all|web|api|main|canvas|serve|ai|mobile]" >&2
    exit 2
    ;;
esac

if [[ "$SKIP_VERIFY" != "true" ]]; then
  "$ROOT_DIR/scripts/verify-services.sh" "$TARGET"
fi

railway_cmd() {
  RAILWAY_CALLER="skill:use-railway@1.2.1" \
  RAILWAY_AGENT_SESSION="$RAILWAY_AGENT_SESSION" \
  railway "$@"
}

railway_scope_args() {
  if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
    printf '%s\n' --project "$RAILWAY_PROJECT_ID"
  fi
}

ensure_railway_context() {
  if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
    (
      cd "$ROOT_DIR"
      railway_cmd link \
        --project "$RAILWAY_PROJECT_ID" \
        --environment "$RAILWAY_ENVIRONMENT" \
        --json >/dev/null
    )
  fi
}

latest_deployment() {
  local service="$1"
  railway_cmd deployment list \
    --service "$service" \
    --environment "$RAILWAY_ENVIRONMENT" \
    --limit 1 \
    --json
}

deployment_field() {
  local field="$1"
  node -e '
    let body = "";
    process.stdin.on("data", chunk => body += chunk);
    process.stdin.on("end", () => {
      const rows = JSON.parse(body);
      process.stdout.write(rows[0]?.[process.argv[1]] ?? "");
    });
  ' "$field"
}

deploy_railway() {
  local service="$1"
  local source_dir="$2"
  local scope=()
  local before_id
  local latest
  local deployment_id=""
  local status=""

  command -v railway >/dev/null || { echo "railway CLI is required" >&2; exit 1; }
  ensure_railway_context
  mapfile -t scope < <(railway_scope_args)
  before_id="$(latest_deployment "$service" | deployment_field id)"

  echo "== Deploy Railway: $service =="
  railway_cmd up "$ROOT_DIR/$source_dir" \
    --path-as-root \
    --service "$service" \
    --environment "$RAILWAY_ENVIRONMENT" \
    "${scope[@]}" \
    --detach \
    --json \
    --message "$RELEASE_MESSAGE"

  for _ in {1..30}; do
    latest="$(latest_deployment "$service")"
    deployment_id="$(printf '%s' "$latest" | deployment_field id)"
    if [[ -n "$deployment_id" && "$deployment_id" != "$before_id" ]]; then
      break
    fi
    sleep 2
  done

  if [[ -z "$deployment_id" || "$deployment_id" == "$before_id" ]]; then
    echo "A new Railway deployment was not observed for $service" >&2
    exit 1
  fi

  for _ in {1..90}; do
    latest="$(latest_deployment "$service")"
    status="$(printf '%s' "$latest" | deployment_field status)"
    case "$status" in
      SUCCESS|SLEEPING)
        echo "Railway deployment ready: $service $deployment_id ($status)"
        return
        ;;
      FAILED|CRASHED|REMOVED)
        echo "Railway deployment failed: $service $deployment_id ($status)" >&2
        railway_cmd logs --service "$service" --environment "$RAILWAY_ENVIRONMENT" "${scope[@]}" --lines 100 --json || true
        exit 1
        ;;
    esac
    sleep 10
  done

  echo "Timed out waiting for Railway deployment: $service $deployment_id ($status)" >&2
  exit 1
}

deploy_web() {
  command -v vercel >/dev/null || { echo "vercel CLI is required" >&2; exit 1; }
  echo "== Deploy Vercel: flownote-react =="
  if [[ -n "${VERCEL_TOKEN:-}" && -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
    (
      cd "$ROOT_DIR/flownote"
      vercel pull --yes --environment=production --token "$VERCEL_TOKEN"
      vercel build --prod --token "$VERCEL_TOKEN"
      vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN"
    )
  else
    (cd "$ROOT_DIR/flownote" && vercel deploy --prod --yes)
  fi
  curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 5 \
    "${FLOWNOTE_WEB_HEALTH_URL:-https://flownote-react.vercel.app/}" >/dev/null
}

deploy_mobile_health() {
  curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 5 \
    "${FLOWNOTE_MOBILE_HEALTH_URL:-https://flownote-mobile-production-production.up.railway.app/health}" >/dev/null
}

deploy_api_health() {
  curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 5 \
    "${FLOWNOTE_API_HEALTH_URL:-https://flownote-api-production.up.railway.app/}" >/dev/null
}

deploy_target() {
  case "$1" in
    web) deploy_web ;;
    api) deploy_railway flownote-api flownote-API; deploy_api_health ;;
    main) deploy_railway flownote-main flownote-server ;;
    canvas) deploy_railway flownote-canvas flownote-canvas ;;
    serve) deploy_railway flownote-serve flownote-serve ;;
    ai) deploy_railway flownote-ai flownote-ai ;;
    mobile) deploy_railway flownote-mobile-production flownote-mobile; deploy_mobile_health ;;
  esac
}

if [[ "$TARGET" == "all" ]]; then
  for target in main canvas serve ai api mobile web; do
    deploy_target "$target"
  done
else
  deploy_target "$TARGET"
fi

echo "Production deployment passed: $TARGET"
