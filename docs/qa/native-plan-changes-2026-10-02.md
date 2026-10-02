# Native subscription changes, October 2, 2026

Android paid plan buttons now initiate a RevenueCat/Google Play replacement purchase instead of sending users to the subscription-management list. Cancellation still opens Google Play; Apple purchases still use the native Apple management sheet. Billing remains with the original store across devices.

## Replacement policy

- Plus to Pro: `WITH_TIME_PRORATION`, immediate access after server verification. This also supports cross-period upgrades whose price per unit of time may be lower.
- Pro to Plus: `DEFERRED`, existing Pro access remains until renewal. A successful deferred purchase returns the old entitlement, so the UI reports a scheduled change rather than an immediate downgrade.
- Same tier, monthly/yearly change: `WITHOUT_PRORATION`. Google requires this or full-price charging for an auto-renewing base-plan replacement within the same subscription. New pricing starts at the next payment.
- The existing product passed to RevenueCat is the plain subscription ID, without its base-plan suffix. The new package retains its exact product/base-plan identity.
- Google confirmation supplies the final price, charge and effective date. No client code grants access; Clover's existing server verification remains authoritative.

The configured RTDN connection is documented in `docs/mobile-store-setup.md`. No new secrets, product IDs, backend endpoints or schema changes are required.

## Additional cases covered

Fresh store ownership and exact product metadata are required before purchasing. Missing, stale, conflicting, multiple, refunded, paused, prepaid or billing-problem subscriptions do not start another purchase. Cross-store and web subscriptions remain with their billing provider. Admin grants are not treated as subscriptions to cancel.

Current paid cards expose Change billing period. Manage subscription remains available during verification and when prices cannot load. Google management links target the current subscription when identifiable, with the general subscription list as an offline fallback. Refresh retries failed offering loads. Dialog and operation locks prevent duplicate taps. Cancellation handles both RevenueCat cancellation representations; pending/ambiguous errors require an explicit refresh or restore before another attempt. A successfully confirmed purchase remains pending if the server is still reporting the previous plan.

## Automated evidence

`mobile/scripts/store-plan-change-check.mjs` executes the actual billing bridge, pure policy and SettingsPlan handlers with mocked store/server responses. It covers all 12 distinct Google product/base-plan transitions, 4 same-product rejections, ownership/staleness/metadata/billing failures, deferred and delayed verification, cancellation and pending-payment errors, offering retry, restore, original-store routing and manual access. This is part of the required pre-push gate through `check:charts`.

Existing Apple management, native navigation, auth, upload, chart and security checks remain in the full gate. These tests do not make purchases or prove live store behavior.

## Device checks for the new binaries

On the Google test account, confirm Plus to Pro opens the Google replacement confirmation, then verify Pro on Android and iOS. Confirm Pro to Plus is scheduled and Pro remains until the store's effective date. Check monthly/yearly changes, canceled confirmation, cancellation to Free at expiry, and restore. Apple plan management should continue opening its native subscription options. Use store test purchases; do not infer success from a dialog dismissal.

Sources: https://developer.android.com/google/play/billing/subscriptions and https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions.
