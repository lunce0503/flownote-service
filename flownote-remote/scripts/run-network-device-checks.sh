#!/usr/bin/env bash
set -euo pipefail
test "${CI:-}" = true
mkdir -p android/app/src/androidTest/assets
cp artifacts/tests/thumb_up.jpg android/app/src/androidTest/assets/thumb_up.jpg
rm -f android/app/src/androidTest/assets/session.json
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
