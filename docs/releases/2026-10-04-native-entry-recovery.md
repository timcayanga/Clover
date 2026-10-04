# Native entry and deleted-account purchase recovery

## Behavior

- Opening scenes use focused editable Figma previews, with real Philippine institution logos, a multi-category spending report, and an Ask Clover conversation. Subtitles are removed.
- Fresh signups show onboarding while bootstrap runs. Existing-account sign-in retains retry/sign-out controls, and Home remains gated by actual onboarding completion.
- Empty Transactions invites a first transaction; filtered empty results retain search/filter guidance. Actionable warnings show their reason beneath the account/date.
- Plan cards show the published USD catalog price immediately, then the store's localized metadata. Settings headers omit the decorative Ask Clover shortcut; shared navigation remains available.
- iOS offers explicit purchase recovery following an ownership conflict, only when enabled server-side. StoreKit supplies an Apple-signed transaction. The server verifies the signature, Clover bundle/product, purchased ownership, environment, RevenueCat owner, and completed deletion before app-scoped transfer. Active accounts cannot be taken over. Recovery never recreates deleted financial data or changes cancellation/expiry.
- Android retains support-assisted ownership recovery; ordinary purchase, restore, and plan changes remain supported.

## Enablement

`REVENUECAT_RECOVERY_API_KEY` is a server-only RevenueCat V2 key for project `c4469f47`, with Customers, Subscriptions, and Purchases read/write permissions. Do not include it in Expo/public variables. The recovery endpoint and native action remain disabled without it. Key creation requires the pending account-owner approval.

Migration `20261004010000_store_purchase_recovery` adds an ownership audit and destination reservation. It stores no receipt payload or financial records. Retry after an unknown transfer outcome re-verifies ownership and synchronizes current access without purchasing again.

Production TestFlight sandbox receipts remain restricted to exact server-configured Clerk IDs. Recreating a demo account gives it a new ID; matching email alone never authorizes purchase transfer.

## Verification and limits

- Automated tests cover invalid/forged receipt rejection, completed deletion, live-source rejection, environment/ownership checks, target deletion, concurrent destination reservation, app-scoped transfer, idempotency, and retry after an unknown network outcome.
- Welcome component inspected at 390x844 and 360x640 using actual native component code with mocked services.
- Read-only inspection of the two recent receipts in the demo accounts found no review reasons or duplicate matches. Existing and additional API projections verify clean 98% and fractional-confidence receipts produce no warning. Their earlier warning could not be reproduced from the current records.
- Final Apple-signed recovery and signup navigation still require physical-device testing of the new binary. Automated and browser checks do not replace store/device tests.

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=1075-51550
