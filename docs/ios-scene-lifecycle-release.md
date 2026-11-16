# iOS 27 launch crash — 2026-10-17

The customer crash report for production bundle `ph.clover.app`, binary version
`0.1.0 (41)`, records `EXC_BREAKPOINT / SIGTRAP` on the main thread in
`___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`.
The device is iPhone18,2 running iOS 27.0.1. This is UIKit enforcing scene
lifecycle adoption, before normal application UI startup.

The retained local `1.0.1 (48)` archive also has no
`UIApplicationSceneManifest` and was built against `iphoneos27.0`. Do not treat
that pending binary as a fix for this crash.

## Correction

Keep `ios.enableSceneSupport: true` in the `expo-build-properties` plugin in
`mobile/app.config.ts`. Expo SDK 57 requires this opt-in; the installed Expo
57.0.30 and expo-build-properties 57.0.22 support it. Generate the native iOS
project from the corrected configuration before compiling a replacement.

Clean prebuild was verified with all Clover plugins and the installed SDK
template in an isolated temporary project. Its generated output has:

- A `UIApplicationSceneManifest` whose application configuration uses
  `EXExpoAppSceneDelegate`.
- `AppDelegate` conforming to `ExpoReactNativeFactoryProvider` and retaining
  its factory assignment.
- No legacy window creation or `startReactNative` call in AppDelegate.
- URL/user-activity forwarding and the Apple sign-in entitlement retained.

`npm --prefix mobile run check:ios-release` repeats these generation checks
without credentials or changes to existing native projects. It is included in
`qa:mobile`, and therefore in the shared local/GitHub `qa:prepush` gate.

These are generation checks, not a compiled app or device launch test. Before
replacing the queued App Review build, compile and test a new build on iOS 27,
including cold/warm launch, background/resume, authentication redirects and
store-purchase return. Verify the scene manifest in the final signed IPA as
well, so stale native output cannot pass artifact validation. Use a new build
number; do not overwrite build 48 or its validation records.

A web/API deployment or JavaScript-only update cannot add this native startup
wiring to existing installations. The App Store submission has not been
changed as part of this diagnosis.

References:

- https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle
- https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/
- https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md
