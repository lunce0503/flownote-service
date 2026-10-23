#!/usr/bin/env bash
set -euo pipefail
apk_path="${1:?Provide the exact signed release APK}"
adb install "$apk_path"
adb shell am start -W -n com.flownote.remote.gesture/.MainActivity
adb shell pidof com.flownote.remote.gesture
adb shell uiautomator dump /sdcard/flownote-remote-window.xml
adb shell cat /sdcard/flownote-remote-window.xml | grep -q 'Flownote Remote'
if adb shell dumpsys package com.flownote.remote.gesture | grep -q 'android.permission.CAMERA: granted=true'; then
  echo 'Camera must remain unrequested in this initial release' >&2
  exit 1
fi
if adb logcat -d -s AndroidRuntime:E | grep -q 'com.flownote.remote.gesture'; then
  echo 'Application runtime crash detected' >&2
  exit 1
fi
echo 'PASS: signed Android APK installs and opens without requesting camera access'
