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
device_status=0
./gradlew connectedDebugAndroidTest || device_status=$?
mkdir -p ../artifacts/ux
# Only known dashboard/control captures; pairing/QR screens are never captured.
for image in dashboard clients clients-paused touch-remote touch-buttons; do
  adb pull "/data/local/tmp/flownote-remote-$image.png" "../artifacts/ux/$image-android.png" || true
done
if [[ "$device_status" != 0 ]]; then exit "$device_status"; fi
python3 - <<'PY'
import json
from pathlib import Path
actions=json.loads(Path('../artifacts/tests/touch-events.json').read_text())
for expected in ['pointer.click','pointer.move','pointer.down','pointer.hold','pointer.up']:
    assert expected in actions, f'Android production touch window did not reach TLS output: {expected}'
assert actions.index('pointer.down') < actions.index('pointer.up')
assert actions.count('pointer.click') >= 2, 'Pad tap and saved custom button must both execute through TLS'
print('PASS: production Android touch window -> TLS server -> pointer output: tap, move, held drag, release')
PY
mkdir -p ../artifacts/ux
adb pull /data/local/tmp/flownote-remote-dashboard.png ../artifacts/ux/dashboard-android.png
adb pull /data/local/tmp/flownote-remote-clients.png ../artifacts/ux/clients-android.png
adb pull /data/local/tmp/flownote-remote-touch-remote.png ../artifacts/ux/touch-remote-android.png
adb pull /data/local/tmp/flownote-remote-touch-buttons.png ../artifacts/ux/touch-buttons-android.png
