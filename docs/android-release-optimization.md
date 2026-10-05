# Android release optimization and SDK compatibility

Release builds enable R8, resource shrinking, and `proguard-android-optimize.txt`.
The Expo config plugin installs this configuration again after every clean
prebuild. Do not edit the generated `mobile/android` tree as the source of truth.
Keep the R8 mapping with each release; the AAB embeds it for Google Play.

## Compatibility shims

The pinned React Native 0.86.3, Clerk Android API 1.1.5, and Material 1.13.0
dependencies still contain the call sites reported by Play. No compatible
upstream release identified during this change removes all of them. The small
AGP instrumentation visitor in `mobile/plugins/android-release` modifies only
seven named vendor classes, before R8. It does not modify downloaded AARs or the
Gradle cache. The runtime helper remains ordinary application code, visible to
R8. Re-review these shims when upgrading dependencies and remove each shim once
the upstream fix covers its behavior.

- Clerk `ImageService.compressImage` decodes bounds first, then uses a
  power-of-two sample to keep the longest edge at most 1024 pixels. Invalid
  images produce a controlled failure before compression. This is exclusively
  for profile photos; receipt OCR keeps its own independent resolution policy.
- On Android 15/API 35 and later, React Native and Material's flagged window
  calls no longer read or set deprecated status/navigation bar colors. Android
  supplies edge-to-edge behavior; the SDKs retain their existing insets, icon
  appearance, and contrast handling. DEFAULT/SHORT_EDGES cutout writes become
  ALWAYS. NEVER is preserved for intentionally restricted windows.
- Below API 35, the original color and cutout behavior is preserved. These
  guarded legacy references are necessary for supported older Android versions.
  A static Play scan may still mention them; do not claim every advisory is
  cleared until Play has analyzed the new AAB. Do not raise the minimum Android
  version or remove older-device behavior just to silence that scan.

The prebuild fails on an unexpected React Native/Clerk version. Instrumentation
fails if a targeted class no longer contains any expected call site. It is
stack-neutral: a virtual receiver becomes the first static argument, and a
field write becomes a static call consuming the same operands.

## Verification

`npm --prefix mobile run check:android-release` runs Java regression checks for
API levels 26, 28, 30, 34, 35 and 36, portrait/landscape/panoramic/invalid images,
sampling boundaries, and idempotent Expo Gradle changes. It is included in the
shared pre-push/GitHub quality gate. Java 17 is required.

For each optimized release also validate the actual compiled vendor classes,
the signed bundle, embedded mapping and R8 metadata, and launch a minified APK
derived from that AAB. Check sign-in, store plans, profile photo selection,
receipt selection, sheets, and system-bar/keyboard layout on physical devices
before promoting the release beyond internal testing. Unit checks do not
replace physical-device purchase or camera verification.

References:
- https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/
- https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
- https://developer.android.com/topic/performance/issues/code-optimization
- https://developer.android.com/develop/ui/views/layout/edge-to-edge
- https://developer.android.com/topic/performance/graphics/load-bitmap
