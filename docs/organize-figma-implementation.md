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

Native Accounts and Recurring are read-only views using authorized Profile data; this update does not claim native editing parity with the web. The existing native Home API does not supply every web chart or historical balance comparison. Unavailable comparisons are not fabricated.

Local browser checks use isolated PostgreSQL fixtures and temporary QA wrappers around the actual pages, because signed-in routes require authentication. Mobile warning navigation is redirected to a temporary wrapper around the actual transaction detail component. These wrappers are removed before release. No staging financial records are edited during these checks.

The native browser preview checks verify shared React Native rendering, not operating-system permissions, camera hardware, speech services or store distribution. Those require native builds and device checks. Apple Developer and Google Play Console access does not itself publish a new app version.

New presentation regressions cover account label disambiguation, last-four-only mobile projection and read-only recurring API access. The required repository pre-push gate includes web regressions, native type/dependency checks, iOS/Android JavaScript bundles and the production web build.

A local Expo config plugin prevents CocoaPods post-install UUID collisions, related to React Native PR 57576. Generated native projects and dependency directories are not committed.
