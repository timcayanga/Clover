# Organize Figma update — September 12, 2026

Reference: Screens / Organize in Figma file FNnCmCj90szZAnZ6twMPCy, including the latest Figma task decisions for Home, Accounts, Transactions, Recurring, Add/Upload/Ask and signed-in dark mode.

## Delivered presentation

- Shared Adviser placement and signed-in dark palette; public marketing styles remain separately scoped.
- Home balance visibility, summary spacing and percentage-only comparison fallback.
- Account cards use subtle institution colors and theme-aware text.
- Transactions use account name and last four digits, desktop optional columns/tags, bare warning counts and mobile warnings inside Filters. Mobile warning taps open the existing dedicated detail page with reasons and editable fields.
- Recurring calendar shows payment names and amounts, exposes all payments for crowded dates, and hides empty Review Suggestions below the calendar.
- Upload has three large input actions. Ask includes the Clover mark, speech input and camera attachment entry. Financial changes still require the existing review/save flow.
- React Native iOS/Android sources share theme-aware screens and navigation, Home, account cards, recurring calendar, warning/filter presentation and Add/Ask/Upload controls.

## Scope and verification boundaries

The initial release had read-only native Accounts/Recurring and incomplete Home reports. The follow-up implementation in `native-organize-completion.md` adds native editing, payment actions and Home data views. Unavailable comparisons are not fabricated.

Local browser checks use isolated PostgreSQL fixtures and temporary QA wrappers around the actual pages, because signed-in routes require authentication. Mobile warning navigation is redirected to a temporary wrapper around the actual transaction detail component. These wrappers are removed before release. No staging financial records are edited during these checks.

The native browser preview checks verify shared React Native rendering, not operating-system permissions, camera hardware, speech services or store distribution. Those require native builds and device checks. Apple Developer and Google Play Console access does not itself publish a new app version.

New presentation regressions cover account label disambiguation, last-four-only mobile projection and explicit recurring API access. The required repository pre-push gate includes web regressions, native type/dependency checks, iOS/Android JavaScript bundles and the production web build.

A local Expo config plugin prevents CocoaPods post-install UUID collisions, related to React Native PR 57576. Generated native projects and dependency directories are not committed.

Expo 57’s Constants build phase and React Native bundle launcher use quoted paths so native iOS builds work from this repository’s `Finance Manager` folder. It uses the upstream Node wrapper and preserves the resource bundle destination.

## Verification results

- 19/19 local desktop/mobile-web presentation and interaction checks passed.
- 12/12 React Native browser-preview checks passed across light and dark mode. These are not OS device tests.
- Android arm64 debug APK build passed; recording permission verified in the packaged manifest.
- iOS arm64 simulator build passed; packaged microphone/speech descriptions, automatic appearance and generated Expo configuration verified.
- Full repository pre-push gate passed, including the presentation updates, microphone permissions and iOS build-script fixes.
- TestFlight/Google Play distribution and physical-device camera/speech QA are not included.
