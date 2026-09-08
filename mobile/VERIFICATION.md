# Native preview verification · 7 September 2026

## Verified

- TypeScript checks for the website and mobile app.
- Expo dependency compatibility check.
- iOS and Android Hermes bundle export from the same mobile source tree.
- Native project generation for both platforms; Android backups disabled and
  no native Apple Sign In entitlement before enrollment.
- Existing Clover release regressions and optimized Next.js build.
- Mobile API unit regression: method/path allowlist, pending-factor rejection,
  principal isolation across concurrent requests, no guest/local-admin fallback,
  exact-request origin exemption, unchanged browser CSRF checks, no-store headers,
  and omission of raw import payloads/storage keys.
- Browser-rendered sample flow: enter sample mode, open Transactions, edit and
  save tags, search the saved tag, open sample import completion, view Account,
  leave sample mode, and re-enter/leave a second time.
- Sample mode generated zero `/api/` requests during that flow.
- Phone/tablet layout checks at 320×568, 390×844, 768×1024, and 844×390.
  No horizontal overflow; bottom navigation remains available. Long pages scroll.

The initial sign-out check uncovered an ambiguous `/` route/redirect loop.
Public Welcome now has its own route and the root stack owns authentication
guards. Repeated entry/exit passed after the fix, with no browser errors.

## Not verified / not enabled

- Native `.app`, `.ipa`, `.apk`, or `.aab` compilation: full Xcode/CocoaPods and
  Android SDK/JDK are not installed on this Mac.
- Simulator, emulator, physical-device, VoiceOver, or TalkBack testing.
- Live Clerk native sign-in, MFA/SSO, callback configuration, token refresh.
- Real account → mobile API → transaction edit/import → rendered result.
- Camera/picker permissions, native multipart uploads, background/resume behavior.
- Store purchases, RevenueCat, restored purchases, push notifications, submission.

The mobile API remains disabled by default. No production user records or
subscriptions were modified for testing. This is an initial native preview,
not a feature-complete or store-ready release.

The dependency audit reports moderate transitive Expo/Clerk advisories and no
high/critical findings. Reassess before release; do not force incompatible SDK
versions merely to hide advisory output.
