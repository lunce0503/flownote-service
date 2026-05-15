#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

detect_lan_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

HOST_LAN_IP="${HOST_LAN_IP:-$(detect_lan_ip)}"

if [ -z "$HOST_LAN_IP" ]; then
  echo "HOST_LAN_IP is required. Example: HOST_LAN_IP=192.168.0.10 scripts/docker-mobile-up.sh" >&2
  exit 1
fi

export HOST_LAN_IP
export MOBILE_CORE_API_URL="${MOBILE_CORE_API_URL:-http://${HOST_LAN_IP}:8080}"
export MOBILE_AI_API_URL="${MOBILE_AI_API_URL:-http://${HOST_LAN_IP}:8000}"
export MOBILE_WEB_URL="${MOBILE_WEB_URL:-http://${HOST_LAN_IP}:5173}"
export EXPO_PUBLIC_WAS_URL="${EXPO_PUBLIC_WAS_URL:-http://${HOST_LAN_IP}:8080}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://${HOST_LAN_IP}:3000,http://${HOST_LAN_IP}:5173,http://${HOST_LAN_IP}:8081,http://localhost:3000,http://localhost:5173,http://localhost:8081}"

echo "Using HOST_LAN_IP=${HOST_LAN_IP}"
echo "Expo will load WAS from ${EXPO_PUBLIC_WAS_URL}"
echo "WAS will return web URL ${MOBILE_WEB_URL}"

cd "$ROOT_DIR"
docker compose up -d --build spring-server react-app mobile-app
