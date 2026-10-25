#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node scripts/check-release.mjs)
package="artifacts/linux/Flownote-Remote-$version-linux-x64"
test ! -e "$package"
node scripts/prepare-vision.mjs
dotnet publish src/Flownote.Remote.Cli -c Release -r linux-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:DebugType=None -p:DebugSymbols=false -o "$package"
mkdir -p "$package/scripts" "$package/artifacts" "$package/node_modules" "$package/docs" "$package/packaging" "$package/config"
cp scripts/vision-worker.mjs scripts/voice-worker.mjs "$package/scripts/"
cp -R artifacts/vision "$package/artifacts/"
# Only the pinned Playwright runtime packages; no browser cache or test fixtures.
cp -R node_modules/playwright node_modules/playwright-core "$package/node_modules/"
cp docs/CLI.md docs/NETWORK.md docs/GESTURES.md docs/UX.md docs/RELEASING.md "$package/docs/"
cp config/Apache-2.0.txt config/scoped-gestures.json "$package/config/"
cp packaging/flownote-remote.service packaging/dotnet-LICENSE.txt "$package/packaging/"
cp README.md THIRD-PARTY-NOTICES.md "$package/"
cp -R licenses "$package/"
mkdir -p "$package/vendor/sound-manager"
cp vendor/sound-manager/LICENSE "$package/vendor/sound-manager/"
test -x "$package/flownote-remote"
"$package/flownote-remote" help > /dev/null
tar -czf "artifacts/Flownote-Remote-$version-linux-x64.tar.gz" -C artifacts/linux "Flownote-Remote-$version-linux-x64"
printf '%s\n' "artifacts/Flownote-Remote-$version-linux-x64.tar.gz"
