# Mobile return and Home reminders — November 5, 2026

## Changes

Native Clover keeps the existing Clerk credential keys and SecureStore accessibility policy. Its cache no longer delegates to a dependency that deletes credentials after a failed keychain read. A temporary storage failure propagates as a retryable failure, preserving credentials for the next read. Cache operations are serialized so rotation cannot race a later explicit sign-out. Remember-me remains enabled by default; explicitly disabling it keeps credentials process-local, and turning it back on persists current credentials. Expired/revoked sessions, verification requirements and explicit sign-out are not bypassed. No Clerk lifetime/security settings are changed.

The automatic splash privacy cover has been removed. Native menus, inactive transitions and the app switcher retain the latest mounted page. This intentionally makes the page visible in the app switcher as requested. Authentication and encrypted offline-storage authorization are unchanged.

Signed-in mobile users see a one-second, tappable teal greeting after authenticated setup and on returning after at least 30 seconds in the background. Opening a native menu, switching routes or showing a system prompt does not replay it. It does not delay requests or replace the current route. Mobile web has the corresponding greeting; desktop has none.

Home's confirmed recurring payments show their due date and calendar-day countdown. Invalid dates do not produce invented countdowns. The calculation uses Clover's existing Manila schedule-day convention, including month/year boundaries, and updates while the page remains open. Unconfirmed suggestions retain their existing review presentation.

Pending Split Bills load independently of Home's balances/charts. The authenticated, no-store summary reuses the existing authorized Split Bills loader and settlement calculation. Resolved/settled bills are omitted; partial settlements show the remainder. Each bill retains its own currency. Only count, title, ID, currency and remaining amount reach the new card. The native card refreshes on focus and pull-to-refresh, and honors Home's hide-balances control. No financial records are changed.

## Figma

Main [Screens file](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens): the existing mobile Home component has dated payments and a pending Split Bills card, with its wrapper extended below all content and navigation. New mockups: [Greeting](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=2346-100805) and [Menu over the current page](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=2346-100825). Mock balances/names are illustrative.

## Validation prerequisites

The release gate detected newly required SDK 57 patch versions. Expo and its recommended build-properties, constants, dev-client, glass-effect, image-picker, location, router, sharing and splash-screen patches were updated together with the lockfile. React Native/React and the SDK major remain unchanged. The newly optional CLI schema dependency is explicitly pinned to Clover’s existing Zod 4.6.6 version. The compatibility test now exercises Expo’s relocated JSON metadata validator and its injected-Zod MCP schema, retaining the invalid-input and bounded-input checks. Compatibility and security checks remain enabled. Native runtime validation is deferred to the next binary, as requested.

## Verification and release boundary

- `mobile/scripts/persistent-token-cache-check.mjs`: cold process restart, existing Clerk key compatibility, temporary read/write errors, explicit sign-out, remember preference and rotation ordering using an isolated storage adapter.
- `mobile/scripts/home-return-check.mjs`: due dates/countdowns, time-zone/day boundaries, absent names, pending/partial/settled/resolved bills, separate currencies and no input mutation.
- `web/scripts/mobile-return-browser-regression.cjs`: real React web/native greeting components with isolated auth/AppState adapters, one-second dismissal, menu suppression, long-background return, no desktop greeting, optional Split Bills card and destination links. Requires the locally installed Chrome executable, not a personal browser session.
- Native auth/recovery suite, web/native type checks and the complete root pre-push gate remain required.

Staging only. No production promotion, installable binaries or app-store upload. Installed iOS/Android clients need a future binary for the new cache, greeting, menu and Home UI. Synthetic verification does not prove physical-device keychain reliability or change provider-enforced session expiry.
