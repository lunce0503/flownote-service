#!/usr/bin/env bash
set -euo pipefail
test "${CI:-}" = true
mkdir -p android/app/src/androidTest/assets
cp artifacts/tests/thumb_up.jpg android/app/src/androidTest/assets/thumb_up.jpg
rm -f android/app/src/androidTest/assets/session.json
# Compile before issuing the short-lived invitation; only the test asset is repackaged afterwards.
(cd android && ./gradlew assembleDebug assembleDebugAndroidTest)
adb shell wm size 960x1920
adb shell wm density 480
adb shell settings put system font_scale 1.3
dotnet build tests/Flownote.Remote.Fixture -c Release
dotnet tests/Flownote.Remote.Fixture/bin/Release/net10.0/Flownote.Remote.Fixture.dll android/app/src/androidTest/assets/session.json &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 90); do
  test ! -f android/app/src/androidTest/assets/session.json || break
  kill -0 "$fixture_pid"
  sleep 1
done
test -s android/app/src/androidTest/assets/session.json
cd android
./gradlew connectedDebugAndroidTest
mkdir -p ../artifacts/ux
adb pull /data/local/tmp/flownote-remote-dashboard.png ../artifacts/ux/dashboard-android.png
adb pull /data/local/tmp/flownote-remote-clients.png ../artifacts/ux/clients-android.png
