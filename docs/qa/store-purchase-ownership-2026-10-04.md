# Store purchase ownership recovery · 4 October 2026

## Diagnosis

A read-only check of the production account and RevenueCat subscriber records confirmed that the current demo Clover login has no Apple subscription. Its Apple test purchase is attached to the earlier Clover login used with that Apple store receipt. This is RevenueCat's configured **Keep with original App User ID** behavior, not a missing payment confirmation or a delayed shared plan refresh. No purchase was transferred, refunded, canceled or manually granted during investigation.

The demo login was also deleted and recreated, giving it a new Clerk ID. Its explicitly authorized production sandbox tester entry has been added while preserving the existing entries. A fresh Vercel environment pull verified the update. It takes effect on the next production deployment and does not itself grant any paid entitlement.

The account identifiers, provider responses and environment maintenance audit remain outside the repository. The app does not disclose the email or identity of the other purchase owner.

## Changes

- Store actions verify the SDK's actual App User ID after configuration or login, rather than trusting a JavaScript-only identity cache. A native identity switch that does not complete blocks checkout.
- Restore validates the returned purchase owner before asking Clover's server to verify the entitlement. Client SDK claims still cannot grant access.
- RevenueCat ownership errors 7/13 now explain that the user should sign into the Clover login used for the original purchase, or contact Clover support if that login was deleted or is inaccessible. The help path is linked from Plan.
- A known ownership conflict remains visible after Refresh plan status; it does not become a fresh invitation to buy again. An explicit successful restore clears the conflict.
- Product-already-purchased error 6 remains a separate condition and can recommend restoring on the current account without asserting another account owns it.
- Cancellation, pending payment, network failure, delayed server verification, Google plan replacement and original-store management behavior are preserved.

No automatic `syncPurchases` call was added to checkout: the installed RevenueCat SDK warns against mixing that observer/migration method with normal `purchasePackage` usage. No provider-wide transfer policy was changed.

## Verification

Passed:

- `node mobile/scripts/store-management-check.mjs`
- `node mobile/scripts/store-plan-change-check.mjs`
- `npm --prefix web run qa:store-tiers`
- `cd mobile && npx tsc --noEmit`

New behavioral coverage checks SDK identity restoration, a failed native identity switch, returned restore owner mismatch, distinct error codes, and purchase/restore ownership failures followed by Refresh. Existing cancellation, retry, deferred Google changes and live/sandbox entitlement regression cases also pass.

Physical recovery for the demonstrated test receipt: sign into the original Clover account and use Restore purchases or Refresh plan status. To demonstrate a first purchase on a different Clover account, use a separate Apple sandbox tester with fresh purchase history. Another Clover account alone does not create a new Apple receipt. These automated tests do not replace that installed-device check.

References:

- https://www.revenuecat.com/docs/projects/restore-behavior
- https://www.revenuecat.com/docs/getting-started/restoring-purchases
