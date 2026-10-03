#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p screenshots
trap 'adb pull /sdcard/Android/data/kr.flownote.remote/files/. screenshots/ || true' EXIT
./gradlew connectedDebugAndroidTest --stacktrace
