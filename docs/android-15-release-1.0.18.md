# Android 15 and photo memory — 1.0.18 (38)

## Findings

The Play report for build 37 lists methods after R8 merging and outlining. The
embedded `proguard.map` maps the bitmap methods to Glide, CanHub Cropper, Fresco,
and the animated image decoder. The app already renders images with `expo-image`
(Glide on Android). These method names alone do not prove an unbounded download
or decode in application code.

React Native 0.86.3 still reads/writes window bar colors from its prebuilt Android
library. Updating JS `StatusBar` properties cannot remove those native calls.

## Changes

- Camera/gallery chat selection uses ImagePicker's raw export path (`quality: 1`),
  avoiding its preliminary full-resolution compression.
- Native upload processing uses `Image.loadAsync` with both dimensions bounded:
  2048 px for chat and 512 px for avatars. ImageManipulator receives the bounded
  native reference. Compression retries reuse it; bitmap/context/source references
  are released in `finally`, including failure paths. Web retains URI processing.
- Full-size chat previews mount only while open. Avatar display caches thumbnails
  in memory and on disk; private authenticated chat images retain their existing
  cache policy. Native display downscaling remains enabled.
- `expo-image` is updated to 57.0.5 and ImagePicker to 57.0.18.
- `plugins/android/edge-to-edge.gradle` uses the Android Gradle Plugin's ASM
  instrumentation API on the specific native UI libraries that own windows.
  Android 15+ skips deprecated window color calls, reads transparent system bar
  colors, and writes `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS`. Existing insets/icon
  handling is retained. Android 7–14 keeps the original compatibility code.
- The Expo config plugin attaches that Gradle script to generated Android projects.
  It does not patch local dependency caches, use reflection, or suppress lint.
- The production EAS submission profile now points to Google Play production.

## Verification

`npm run typecheck` and `npm run lint` passed. The final test run
(`npx vitest run --maxWorkers=2`) passed 114 files / 674 tests; 2 files / 49 tests
were skipped. The limited worker count avoids timeouts during native compilation.

The native `:app:testTaxigrEdgeToEdge` task compiles, transforms and executes a JVM
fixture with verification enabled. It checks SDK 24/28/29/30/34/35/36 against all
four cutout values: legacy APIs are invoked only below SDK 35. Run this task before
the release bundle build. Release artifacts and store receipts are saved under
`tmp/store-release-1.0.18/`.

The signed release AAB passed `bundletool validate` and upload-certificate
verification. Its manifest contains version 1.0.18 (38), target SDK 36, and the
compiled bundle uses the production API. All 31 voice MP3s, 27 notification WAVs
and both Manrope fonts match their sources. The 52 native 64-bit libraries meet
16 KB ELF alignment. The post-R8 DEX audit confirms SDK guards around system-bar
calls and modern cutout values in the generated release code.

## Google Play submission

Submitted to the production track on 2026-09-17 at 00:38 UTC. A fresh API read
confirmed release 1.0.18, version code 38, and
`RELEASE_LIFECYCLE_STATE_IN_REVIEW`. This replaces the pending review of 1.0.17.
Managed publishing is disabled; publication follows Google's approval. The
listing, six phone screenshots and country availability were verified unchanged.

Artifact SHA-256:
`d8b409ca4ed15d3c0e83aff60cf43f7c7ed9fdb10743ba1907520cfd3b5a20e8`.
The signed AAB, verification reports and API receipt are in
`tmp/store-release-1.0.18/` (`native-verification.json`,
`google-play-runtime-verification.json`, `google.json`).

## Limits

This fixes the runtime paths; it does not remove the legacy API references needed
for older Android versions from the artifact. Play's static recommendations can
therefore still mention compatibility code. A new Play pre-launch report is
required to establish whether its recommendations disappear. Do not report these
warnings as cleared merely because upload/validation succeeds.

No device performance measurement is implied by the decode bounds or unit tests.

Follow-up: 1.0.19 (39) was submitted to production review on 2026-09-17,
replacing this pending release. It migrates to AGP 9.0.1 / R8 9.0.32;
see [the 1.0.19 build report](android-build-1.0.19.md). The toolchain limitation
described below applies to 1.0.18 only.

The third recommendation, inspected directly in Play Console, asks for Android
Gradle Plugin 9.0 or later. The installed RN 0.86.3 toolchain pins AGP 8.12.0.
Full R8 optimization and resource shrinking were already enabled and remain so.
This release does not perform a major toolchain migration and does not claim to
clear that recommendation. Expo SDK 57 also has a reported compatibility problem
with newer AGP/Gradle combinations: https://github.com/expo/expo/issues/49550.

References:

- https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge
- https://docs.expo.dev/versions/v57.0.0/sdk/image/
- https://developer.android.com/reference/tools/gradle-api/8.12/com/android/build/api/instrumentation/AsmClassVisitorFactory
