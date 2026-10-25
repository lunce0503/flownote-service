# Third-party notices

## Sound Manager

The Windows application includes SoundManager.Core from
https://github.com/lunce0503/sound_manger at commit
`792cdac30b436d9bbc92933d341316ad03cf0ded`.

Copyright (c) 2026 Lunce. Licensed under the MIT License. The full text is
in [vendor/sound-manager/LICENSE](vendor/sound-manager/LICENSE) in source
and embedded in the Windows EXE, available in the app's Open-source licenses window.

## .NET / Windows Desktop runtime

The Windows portable package includes the .NET runtime and Windows Desktop
runtime published by Microsoft. Their license and notices are available at
https://github.com/dotnet/runtime/blob/main/LICENSE.TXT and
https://github.com/dotnet/runtime/blob/main/THIRD-PARTY-NOTICES.TXT,
and https://github.com/dotnet/wpf/blob/main/LICENSE.TXT.
The MIT text is also embedded in the Windows EXE's Open-source licenses window
and available in [packaging/dotnet-LICENSE.txt](packaging/dotnet-LICENSE.txt) in source.

## MediaPipe Tasks Vision

The Windows EXE embeds @mediapipe/tasks-vision 1.1.1 and Google's Hand
Landmarker, Pose Landmarker Lite and legacy diagnostic Gesture Recognizer models.
Android uses com.google.mediapipe:tasks-vision:1.1.1 and bundles the hand/pose models. Exact download URLs, npm integrity and model SHA-256 are
recorded in [vision.lock.json](vision.lock.json). Licensed under Apache 2.0;
the full text is [licenses/MediaPipe-LICENSE.txt](licenses/MediaPipe-LICENSE.txt)
and is embedded in the EXE. The public thumb-up test image is downloaded only
for acceptance tests and is not bundled in the production EXE/APK.

## NAudio

Windows output volume uses NAudio 2.2.1, Copyright Mark Heath and contributors,
under the MIT License. Full text: [licenses/NAudio-LICENSE.txt](licenses/NAudio-LICENSE.txt),
also embedded in the EXE.

## Microsoft Edge WebView2

The app includes the Microsoft.Web.WebView2 SDK 1.0.4314.35 loader.
Its [license](licenses/WebView2-LICENSE.txt) and [notices](licenses/WebView2-NOTICE.txt)
are embedded in the EXE. The Evergreen WebView2 Runtime is a separate Microsoft
component and must be installed on the Windows device; the .NET runtime and
gesture model are included in the EXE.

## QR generation and reading

Windows uses ZXing.Net 0.16.11 (https://github.com/micjahn/ZXing.Net),
and Android uses ZXing Core 3.5.4 (https://github.com/zxing/zxing).
ZXing authors and contributors. Licensed under Apache 2.0; the complete
license is included in [config/Apache-2.0.txt](config/Apache-2.0.txt),
embedded in the Windows license viewer and bundled in the Android assets.
QR images are generated and decoded locally without a third-party QR service.

## Android network client license

OkHttp 4.12.0 and Okio are licensed under Apache 2.0:
https://github.com/square/okhttp/blob/parent-4.12.0/LICENSE.txt and
https://github.com/square/okio/blob/master/LICENSE.txt.

## Gradle Wrapper license

The source distribution includes the Gradle Wrapper, licensed under Apache 2.0.
https://github.com/gradle/gradle/blob/master/LICENSE

No license grant for the original Flownote application code is implied by
these third-party notices.

## Linux CLI runtime

The Linux archive includes the self-contained .NET/ASP.NET runtime and pinned Playwright 1.62.1 JavaScript packages (Apache 2.0, package license files included). Node.js and the matching Playwright Chromium browser are installed separately; their distribution licenses apply. The offline gesture model uses the MediaPipe notices above. Codex CLI and ALSA utilities are external prerequisites, not redistributed in the archive.
