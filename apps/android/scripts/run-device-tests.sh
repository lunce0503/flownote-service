#!/usr/bin/env bash
set -euo pipefail
node apps/android/scripts/prepare-pairing-fixture.mjs
adb emu virtualscene-image wall "$RUNNER_TEMP/remote-pairing-qr.png"
cd "$(dirname "$0")/.."
./gradlew connectedDebugAndroidTest --stacktrace
adb shell am force-stop kr.flownote.remote
adb shell am start -W -n kr.flownote.remote/.MainActivity
adb shell uiautomator dump /sdcard/remote-restart.xml
adb shell cat /sdcard/remote-restart.xml | grep -q 'CI Linux PC'
adb shell cat /sdcard/remote-restart.xml | grep -q 'QR PC'
echo 'Saved computer list survived application process restart.'
