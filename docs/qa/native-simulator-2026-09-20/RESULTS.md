# Installed native simulator checks — 20 September 2026

Initial audit code: `a674a1effb26f1f6bc2b1537c631f070317e6ebc`. Current mobile code served through the Expo development client on port 8087; API configured for staging.clover.ph.

## Follow-up fixes verified on Android

- Failed asset saves now present a native alert immediately, while retaining the inline error and draft. Verified from the bottom of the form: “Asset details weren’t saved” / “Sign in to save asset details.” Dismissing the alert retained the cost basis, valuation, date, and confirmation controls. This used sample mode and did not change financial records.
- Welcome progression controls now sit outside the scrolling slide content, above the authentication actions. The pager cannot shrink its content into the footer. Verified all four Next steps, visible page indicators, Get started, and transition to the returning-user welcome. Sign up, Log in, and shared navigation remained visible throughout.
- Evidence: `android-welcome-fixed.png`, `android-asset-alert-fixed.png`.
- Mobile TypeScript passed before native verification. Full release gate runs before this change is pushed; installed iOS verification remains blocked as described below.

## Android: observed passes in sample mode

Device: Clover_Parity_20260919, Android API 35, 1080 × 2280. Cold boot completed and the installed Clover Preview loaded the current Metro bundle.

- Welcome → Explore sample Clover → Home worked; sample mode was explicitly labeled fictional.
- Bottom Add opened Manual / Ask Clover / Upload. Upload displayed Choose files, Take photo, Photo library, and the explanation that sample mode does not open/upload personal files.
- Choose files opened the sample completion screen at 100%, with six sample transactions and a View transactions action. This verifies only the demo route, not file selection, transport, or processing.
- Shared bottom navigation remained available on Add, import status, Circles, and investment detail/editor screens.
- Circles → Circle invitations opened and correctly required sign-in. No invitation was created or sent.
- Investments → Portfolio → Global Equity Fund → Asset Details opened with the expected sample value, units, cost basis, and linked account.
- Edit asset opened the actual asset editor. Asset type, currency, opening date/units/cost basis, recorded valuation/date, review, confirmation, and cancel were reachable by scrolling.
- Confirm asset details in sample mode displayed “Sign in to save asset details.” No records were saved.
- Asset valuation history expanded to show dated values (June 1, July 15, September 10). This is sample history, not authenticated API persistence.

## Observed usability findings

1. Resolved in follow-up: asset editor save errors were placed near the top of the form, out of view when confirming from the bottom. The native alert now makes failed-save feedback immediately visible.
2. Resolved in follow-up: welcome progression/Next content fell outside the visible scrolling area above the fixed authentication actions. Progression controls are now fixed above those actions, and all four steps were exercised successfully.
3. The Expo development tool bubble overlaps the upper-right header area. This is development-client tooling and was not classified as a production Clover layout defect.

## iOS: blocked

Device: iPhone 17 Pro, iOS 26.5. It booted to Home. Device Hub screenshots were readable, but touch attempts did not open Safari, and further interactions returned AXError.cannotComplete or stale accessibility IDs. A standalone Simulator.app was not available through the computer-control tool. Alternative simctl UI control was previously requested but has no recorded approval. No current iOS application flow is marked passed.

## Still unverified on installed native apps

- Authenticated file picker and upload >3.5 MB, real pause/resume/cancel and interrupted-upload recovery.
- Circle invitation acceptance/management, contribution member/goal assignments, commitment assignments and visibility.
- Persisted asset edits, per-position buy/sell/reinvest history, paired transfers/reversal, and persisted valuation history.

Those areas have separate automated/database/deployed API evidence in `../native-expansion-2026-09-20.md`; that evidence does not substitute for installed-app end-to-end checks. Native QA login is required to continue. No real financial data or credentials were changed.

## Evidence

- `clover-native-android-upload-sample.png`
- `clover-native-android-asset-guard.png`
- `clover-native-android-valuation.png`

Android was stopped before starting iOS. iOS shutdown was requested after the control failures. No parallel emulator load was used.
