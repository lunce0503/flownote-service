#!/usr/bin/env bash
set -euo pipefail
node apps/android/scripts/prepare-pairing-fixture.mjs
adb emu virtualscene-image wall "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/remote-pairing-qr.png"
node apps/android/scripts/aim-virtual-camera.mjs --watch &
camera_guide_pid=$!
trap 'kill "$camera_guide_pid" 2>/dev/null || true' EXIT
cd "$(dirname "$0")/.."
./gradlew connectedDebugAndroidTest --stacktrace
kill -USR1 "$camera_guide_pid" 2>/dev/null || true
wait "$camera_guide_pid"
adb shell am force-stop kr.flownote.remote
adb shell am start -W -n kr.flownote.remote/.MainActivity
adb shell uiautomator dump /sdcard/remote-restart.xml
adb shell cat /sdcard/remote-restart.xml | grep -q 'CI Linux PC'
adb shell cat /sdcard/remote-restart.xml | grep -q 'QR PC'
echo 'Saved computer list survived application process restart.'
