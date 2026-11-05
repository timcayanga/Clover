# Android R8 and AGP 9 upgrade — November 6, 2026

The source now uses Expo 58.0.23, React Native 0.88.1, AGP 9.2.1 and Gradle 9.4.1. The previous Expo 57 / RN 0.86 toolchain resolved AGP 8.12.0 even though its Gradle wrapper was already version 9. Upgrading the wrapper alone would not resolve Google's AGP warning.

Release builds retain code minification, resource shrinking, full R8 and `proguard-android-optimize.txt`. Optimized resource shrinking is explicitly enabled, even though AGP 9 enables it by default with resource shrinking. The generated `verifyCloverReleaseOptimization` task validates the resolved AGP and effective release configuration before `preReleaseBuild`. Explicitly disabling optimized shrinking causes that task to fail.

The supported Expo template temporarily opts out of AGP's built-in Kotlin and new DSL (`android.builtInKotlin=false`, `android.newDsl=false`). These compatibility flags do not disable R8. AGP 10 migration remains future work; third-party Gradle deprecation warnings do not mean the AGP 9 migration failed.

## Compatibility changes

- Align Expo modules, React, Reanimated, Worklets and TypeScript refs with SDK 58's strict native API. Keep existing keyboard, tab events, contextual Ask Clover and save-in-progress navigation protection.
- Update Clerk and install its separated native-components package to preserve native sign-in UI. Retain bounded profile-photo decoding for Clerk Android API 1.4.1.
- Compile Clover instrumentation against AGP 9.2.1. Remove obsolete React Native status-bar targets now fixed upstream; retain reviewed WindowUtil/Material cutout compatibility.
- Expo Router now uses URLSearchParams. Do not patch the removed query-string dependency. Test its actual new URL helpers with Unicode, duplicate parameters, malformed escapes, callback round-trips and the adversarial malformed-run workload.
- Use the SDK's generated iOS SceneDelegate and verify its native URL/user-activity forwarding, permissions and Apple entitlement. This preserves the earlier startup-crash fix.
- Use Node 24 (see `mobile/.nvmrc`) and JDK 17. SDK platform 37 is needed to compile; target SDK remains 36 and minimum Android API remains 26.

## Validation before any installable package

- Expo Doctor: 20/20 checks.
- Mobile TypeScript, dependency alignment, auth/recovery/upload flows, layout and chart checks.
- Production security audit: no high/critical advisories; existing cryptography and parser security regressions retained.
- Clean Android/iOS prebuild permission and scene checks.
- Gradle `help` and `:app:verifyCloverReleaseOptimization`: resolve AGP 9.2.1 successfully.
- Negative control: `-Pandroid.r8.optimizedResourceShrinking=false` is rejected.
- `:app:processReleaseMainManifest`, `:clover-window:compileReleaseKotlin`, and `:clover-local-ai:compileReleaseKotlin` succeed.
- `node mobile/scripts/android-bytecode-check.mjs` verifies all five compatibility targets in the actual resolved release AARs; rerun after Gradle resolves dependencies on a new machine.
- iOS and Android production JavaScript/Hermes bundle exports succeed. These exports are not installable store binaries.

No APK, AAB or IPA was created or uploaded for this change. Google Play's warnings on existing releases will remain until a new authorized Android binary is built, tested and uploaded. Actual optimized size, memory, startup and Play DEX optimization percentages still need measurement against that release; source settings and configuration checks do not establish those outcomes.

References: [Android optimization](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization), [Expo SDK 58](https://expo.dev/changelog/sdk-58), [React Native AGP 9 migration](https://reactnative.dev/blog/2026/08/11/react-native-0.87).
