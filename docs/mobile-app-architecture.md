# Clover native app architecture

## Decision

Keep the Next.js responsive website in `web/`. Add a dedicated React Native/Expo
app in `mobile/`, shared between iOS and Android. Share backend services and API
contracts; do not try to share DOM components with native screens.

The first implementation is a guarded preview. It is not a completed native port.
RevenueCat, store purchases, and production account access are not enabled.

## Boundaries

| Layer | Responsibility |
| --- | --- |
| Expo app | Native navigation, rendering, accessibility, pickers, temporary UI state |
| Clerk | One Clover identity, hosted sign-in, session tokens in secure storage |
| Mobile API v1 | Verify session token, reject guest fallback, authorize workspace, validate input, minimize response |
| Existing Clover services | Transactions, parser jobs, review/audit trails, effective Pro access |
| PostgreSQL/R2 | Server-only financial records and source-file traceability |

Mobile has no direct database access and no separate parser or Pro boolean.
Request-local authentication permits existing handlers to be reused without
loosening browser-origin protection or introducing a user-controlled identity header.

## Sequence

1. **Current preview:** Transactions read/search and name/note/tag editing; native
   file selection, processing/status/recovery; account/Profile/Pro status; sample mode.
2. **Device validation:** Install native toolchains; configure staging Clerk Native
   API; exercise genuine account → API → test data → rendered result on both OSes.
   Only then enable the guarded mobile API for the staging pilot.
3. **Core completeness:** Native onboarding, account/transaction creation and all
   editing fields; explicit import review and confirmation; larger direct uploads.
4. **Feature modules:** Adviser, Accounts, Recurring, Reports, Investments, Budgeting,
   Goals, Circles, Split Bills, Settings and Account deletion. Build real native
   screens per module using existing backend capabilities; no website wrappers.
5. **Billing:** A provider-neutral subscription ledger and effective-entitlement
   resolver receive Paddle (and optional PayMongo) web events plus RevenueCat store
   events. Stable Clerk IDs connect purchases to the same account on every device.
6. **Release:** Accessibility/device matrix, purchase/restore/refund flows, privacy
   review, observability, store metadata, signing, and App Store/Play review.

## Builds

One mobile source tree exports iOS and Android bundles in `npm run qa:mobile`.
Native binaries still require separate platform compilers and signing. Web builds
remain independent. The quality-gate workflow installs both packages and invokes
the same combined pre-push gate as local development; builds run sequentially to
avoid excessive memory usage. Parallel CI native jobs can be added once signing
and the toolchains are configured.

Generated native project files are reproducible via Expo prebuild and ignored by
Git. No Expo/EAS cloud project, Apple/Google listing, or billing product is created
automatically. The preview IDs are not the final production IDs.

## Known verification gaps

Native bundles and project generation do not prove installed-app behavior.
This Mac currently lacks full Xcode, CocoaPods, and the Android SDK/JDK setup.
Live authentication, production financial mutations, real statement uploads, and
store purchases are not claimed tested. The sample UI is deliberately isolated
from all real user records.
