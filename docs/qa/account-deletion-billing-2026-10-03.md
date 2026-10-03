# Account deletion and store billing · 3 October 2026

Design: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1978-528345

## Behavior

- Fresh RevenueCat subscriber state is verified by Clerk ID, deployment environment and product catalog before cancellation. All potentially billable Clover subscriptions are checked, not just the entitlement currently granting the highest tier. Expired access with billing retries or scheduled resumption still requires cancellation.
- Google Play renewal cancellation uses RevenueCat v1's subscription cancellation endpoint. It does not issue refunds or revoke the last purchase. Any failed lookup/cancellation aborts before the deletion tombstone, Clerk login deletion or local data erasure.
- Existing Paddle/PayPal cancellation now also precedes login deletion. Shared Circle ownership and environment checks precede provider mutations.
- Apple-billed users open Apple Subscriptions, return to Clover, explicitly acknowledge cancellation, type DELETE and confirm deletion. Closing the Apple screen never deletes the account or proves billing stopped. Account deletion does not wait for the paid entitlement to expire. A fresh server-side check requires acknowledgment if Apple billing may still renew.
- Native flows use the billing provider independently of the device platform. Apple management uses StoreKit on iOS and Apple's external subscription page on Android. Web/mobile web use the same protected API rather than deleting the Clerk identity directly.
- Legacy mobile clients remain compatible for Google/no-store accounts. Apple subscribers using an old client receive an actionable instruction to update Clover before confirming deletion.
- Admin deletion and signed Clerk webhook cleanup also cancel Google/web billing before local erasure, but cannot present Apple's interactive user acknowledgment. Administrative deletion does not cancel Apple subscriptions.

## Verification

- Pure rule tests cover multiple stores/tiers, canceled/refunded/expired subscriptions, shared purchases, paused subscriptions, billing retries, stale responses, identity/environment/product mismatches, missing transaction IDs, and explicit Apple acknowledgment.
- Mock-provider lifecycle tests execute the actual deletion orchestrator and store adapter: failed lookups and failed cancellations retain the login/data and create no tombstone; Apple acknowledgment is checked before Google cancellation; cancellation precedes identity/data erasure; webhook retries skip already canceled purchases.
- No real subscription was canceled and no real user was deleted by these tests. Physical-device StoreKit/Android handoff and a disposable sandbox account deletion remain necessary release checks.

References:
- https://www.revenuecat.com/docs/api-v1/transactions (Google Play cancellation)
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
