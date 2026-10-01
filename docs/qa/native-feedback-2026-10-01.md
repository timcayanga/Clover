# Native feedback follow-up · 1 October 2026

## Changes

- Account uses the shared tab navigator, root safe-area inset and bottom navigation. Removed the full-screen Account overlay that bypassed both.
- Launch artwork is exported from Clover vector assets at 1254 × 1044 instead of enlarging the 209 × 174 raster. The privacy shield preserves its aspect ratio.
- Recently loaded pages render their account/Profile/query-specific snapshot while the normal authenticated request refreshes them. Session caches expire after five minutes, are bounded, are cleared on mutations/sign-out/access rejection, and reject late writes after invalidation. Recent encrypted offline snapshots are hydrated only after local-access checks. No financial values or confirmed records are changed.
- Accounts removes the top balance-coverage sentence and groups investment assets by institution and currency. Opening an institution shows its individual assets; Portfolio remains unchanged.
- Sign-in uses a blue Create an account text link. Social signup buttons remain enabled and request explicit agreement when the terms switch is off. Additional verification uses the actual signup flow, including when reached from the sign-in link.
- Plan provides Monthly/Yearly selection, localized store price strings with explicit currency codes, equal card heights, and quiet background entitlement refresh. The absence-of-subscription message is reserved for explicit restoration. Purchase cancellation does not trigger restoration messaging.
- Plan no longer waits for an unnecessary server-to-store verification round trip before requesting its packages; purchases/restores still require server verification before access is granted.

## Design

Updated existing auth, Account and Plan masters in Figma Screens (FNnCmCj90szZAnZ6twMPCy).
Institution assets screen: 1916:528289. Account: 1775:526190. Plan: 682:93146.
Figma shows complete content and persistent mobile navigation.

## Verification

- TypeScript check passed.
- Regression tests cover presentation-cache expiry, account/Profile isolation, late-response invalidation, unknown institutions, currency separation and preservation of original assets.
- Store presentation regressions cover PHP/monthly and USD/annual metadata, silent foreground refresh, explicit restore and pending server verification.
- Added encrypted-cache hydration tests to the offline suite, including unauthorized Profiles and invalidation after a write.
- Cache lookup p95 measured 0.004 ms over 1,000 local iterations. This measures the lookup only, not physical-device page rendering or network latency.
- Isolated 390 × 844 browser export of the native components verified Account header/bottom navigation, institution grouping/detail navigation and Plan selection. All three rendered Plan cards measured 394 px high. Temporary fictional fixtures were restored before release builds.
- Google signup is enabled with the terms unchecked in the browser preview; the native Apple flow still needs device testing.

## Store currency limitation

RevenueCat documents that TestFlight can return USD product metadata even when Apple's purchase confirmation correctly displays PHP. Clover uses the store-supplied price; it does not infer billing currency from device location, account reporting currency, or an exchange rate. Verify the final store confirmation in the replacement build.
https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store

## Remaining physical-device checks

Check iPhone safe area, cold/warm page timing, Apple/Google signup, actual monthly/yearly store prices, cancel/reopen purchase, and sandbox purchase/restore. A browser preview and automated tests do not certify these store/device behaviors.
