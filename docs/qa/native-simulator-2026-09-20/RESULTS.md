# Installed native simulator checks — 20 September 2026

Initial audit code: `a674a1effb26f1f6bc2b1537c631f070317e6ebc`. Current mobile code served through the Expo development client on port 8087; API configured for staging.clover.ph.

## Follow-up fixes verified on Android

- Failed asset saves now present a native alert immediately, while retaining the inline error and draft. Verified from the bottom of the form: “Asset details weren’t saved” / “Sign in to save asset details.” Dismissing the alert retained the cost basis, valuation, date, and confirmation controls. This used sample mode and did not change financial records.
- Welcome progression controls now sit outside the scrolling slide content, above the authentication actions. The pager cannot shrink its content into the footer. Verified all four Next steps, visible page indicators, Get started, and transition to the returning-user welcome. Sign up, Log in, and shared navigation remained visible throughout.
- Evidence: `android-welcome-fixed.png`, `android-asset-alert-fixed.png`.
- Mobile TypeScript passed before native verification. Full release gate runs before this change is pushed; installed iOS follow-up results are documented below.

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
3. Resolved in the runtime follow-up below: the compact welcome layout keeps the full headline above the progress controls on iPhone 17e, without scrolling.
4. The Expo development tool bubble overlaps the upper-right header area. This is development-client tooling and was not classified as a production Clover layout defect.

## iOS: runtime access restored; partial verification completed

The user approved simctl and XCTest on 20 September. A temporary XCTest runner operated the installed `ph.clover.preview` app against Metro port 8087 using mobile source `330cce3062d1cc082d9eddc994b9c825083979f4` and staging API. This is a development-client runtime check, not a TestFlight/release binary certification.

On iPhone 17 Pro / iOS 26.5, the existing signed-in QA session was preserved. Read-only checks used QA-20260914 Golden:

- Profile selection and authenticated Home loaded, including aligned income/expense amounts and shared bottom navigation.
- Navigation opened Investments. The empty state appeared inside Estimated value history; Portfolio opened. This profile contains no holdings, so trading/valuation persistence was not tested here.
- Add → Upload switched correctly and displayed Choose files / Take photo / Photo library.
- Choose files opened the actual iOS Files picker. Cancel returned to Clover. No file was selected or uploaded.
- Circles → Circle invitations loaded the authenticated “No pending invitations” state, with Refresh invitations and shared bottom navigation. No invitation was sent or accepted.
- An initial Portfolio test used the wrong XCTest role (button rather than tab/Other); correcting the selector allowed the tab to open. That automation failure is not classified as an app defect.
- Screenshots: `ios/home.png`, `ios/investments-empty.png`, `ios/file-picker.png`, `ios/circle-invitations.png`.

On a separate iPhone 17e / iOS 26.5, all four signed-out onboarding steps passed XCTest assertions: progress text, reachable Sign up / Log in and Next / Get started controls, transition to returning welcome, then Explore sample Clover. This preserved the QA login on the first simulator. On the smaller screen, slide content scrolls while progression/authentication/navigation controls remain visible.

Sample Investments → Portfolio → Global Equity Fund → Edit asset → Review → Confirm passed on iOS. The native alert immediately showed “Asset details weren’t saved” and “Sign in to save asset details.” Dismissing OK retained the editor and confirmation control; the screenshot confirms opening units 250, cost basis 25000, valuation 28450.75, and date 2026-09-20 remained present. This verifies failed-save feedback, not persisted asset edits. Evidence: `ios/asset-save-alert.png`, `ios/asset-draft-retained.png`. Welcome evidence: `ios/welcome-first.png`, `ios/welcome-last.png`.

The first cold-start attempt timed out fetching the Metro development bundle during severe machine resource pressure. Retrying the development-client connection after startup recovered; this is recorded separately from functional test results.

## Still unverified on installed native apps

- Authenticated file picker and upload >3.5 MB, real pause/resume/cancel and interrupted-upload recovery.
- Circle invitation acceptance/management, contribution member/goal assignments, commitment assignments and visibility.
- Persisted asset edits, per-position buy/sell/reinvest history, paired transfers/reversal, and persisted valuation history.

Those areas have separate automated/database/deployed API evidence in `../native-expansion-2026-09-20.md`; that evidence does not substitute for installed-app end-to-end checks. The iOS QA session is available, but populated isolated fixtures are still required for the remaining write-path checks. No real financial data or credentials were changed.

## Evidence

- `clover-native-android-upload-sample.png`
- `clover-native-android-asset-guard.png`
- `clover-native-android-valuation.png`

Android was stopped before starting iOS. The two iOS simulators were run sequentially. The signed-in iPhone 17 Pro session was preserved.


## Authenticated runtime follow-up

Isolated data: `QA Native Runtime 20260920`, synthetic brokerage holdings and a synthetic workbook. Two existing Clerk QA identities were used; no new accounts or physical devices were required. Existing financial records were not edited. The dedicated QA Profile and Circle remain clearly named for reproducibility.

### Fixes

- Onboarding uses a shorter illustration, tighter spacing and a 24 px headline below 900 logical pixels of viewport height. Text scaling and the scroll fallback remain available. On iPhone 17e (390 × 844), XCTest checked every full headline ends above the progress controls, with Sign up, Log in, Next/Get started visible on all four slides. Screenshots: `ios/welcome-compact-first.png`, `ios/welcome-compact-last.png`.
- A transient transport timeout could leave the offline engine offline until a network-change event, even when the connection had recovered. Foregrounding now rechecks NetInfo before syncing; Sync & Offline offers Retry connection while offline. Plan pages reload when connectivity changes. The installed iOS app recovered and displayed the newly accepted Circle. The offline regression verifies stale figures are replaced after reconnecting.
- Deleting a linked transfer with its original destination field was incorrectly treated as converting an existing trade. Deletion now accepts that payload. The disposable database regression verifies both positions reverse together and retrying deletion is idempotent; imported source data remains unchanged.

### Observed passes

- Actual native `uploadInParts` code, executed against staging with a valid 5,259,637-byte XLSX containing three synthetic rows, paused after server acknowledgement of chunk 0. A fresh call resumed from that chunk and uploaded only chunks 1–3. Completion and repeated completion succeeded. A separate status read returned 100%, done, and three parsed rows; the transaction API returned exactly three rows, PHP 56.78 income and PHP 35.79 expenses. A separate cancelled upload rejected resume. This is real shared-native transport → staging storage/parser → persisted transactions, **not an installed-device picker-to-completion test**.
- The iPhone 17 Pro app opened a pending invitation, displayed its details, and tapped Accept and join Circle. A fresh server read confirmed membership as member, two members, zero pending invites; the invitation disappeared from the pending list. After the reconnect fix, the joined Circle appeared in the app (`ios/circle-joined.png`).
- Buy, sell and reinvest trades persisted through the authenticated API. Replaying each request created no duplicates. Fresh reads returned 12 units and PHP 1,235 cost basis. Paired transfer creation moved units on both sides; the destination-field deletion bug was reproduced and patched.
- The installed iOS app displayed the persisted portfolio, asset details, recorded trades and valuation chart. It edited the synthetic valuation to PHP 1,555.50, reviewed and confirmed it, then returned to Portfolio. A separate authenticated read confirmed that exact value, 12 units and PHP 1,235 basis. The valuation history preserved PHP 1,200, PHP 1,500 and PHP 1,555.50 (`ios/valuation-review.png`, `ios/valuation-saved.png`).
- Mobile TypeScript and 27/27 offline regressions passed. Disposable PostgreSQL checks passed multi-asset isolation, paired transfers/reversal, stale revisions, idempotency, upload assembly and finalization. The complete release gate is run before deployment.

### Scope limits

These results supersede the earlier statements that invitation acceptance and valuation persistence were unverified. This follow-up did not exercise the entire real upload through an installed file picker, native trade entry through its form, Android authenticated write flows, physical-device lifecycle behavior, or release/TestFlight binaries. Those must not be described as passed based on the shared transport/API checks. The iOS development client ran the current source against staging; a staging web deployment does not update an already distributed native binary.
