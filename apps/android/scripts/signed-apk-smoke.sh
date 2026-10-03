#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
adb install release/*.apk
adb shell am start -W -n kr.flownote.remote/.MainActivity
for attempt in $(seq 1 20); do
  adb shell uiautomator dump /sdcard/remote-ui.xml >/dev/null
  if adb shell cat /sdcard/remote-ui.xml | grep -q 'Flownote Remote'; then
    adb shell pidof kr.flownote.remote
    echo 'Signed APK fresh installation and registration screen passed.'
    exit 0
  fi
  sleep 1
done
echo 'Signed APK registration screen did not appear.'
exit 1
