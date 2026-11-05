# Account card replacement

Account Details includes Replace Card for bank, credit card, prepaid and line-of-credit accounts. This updates the number tracked by Clover; it does not replace a physical card at the bank. A debit-card replacement does not need an account-number update if the underlying bank account number remains unchanged.

The user enters only the new last four digits, a replacement date and reason, then explicitly confirms. Clover keeps the same account ID, Profile, balance, transactions and source evidence. The account name remains user-controlled. Do not collect a full card number, CVV or expiry for this flow.

`Account.cardNumberHistory` records the previous and new suffix, effective date, reason, confirmation timestamp, confirming principal and idempotency key. API responses expose only the masked history and dates/reason, never the internal principal or request key. Repeated requests return the current account without rolling back later replacements. Conflicting concurrent requests require a refreshed account.

Only confirmed history authorizes old/new suffix matching. Imports and bank links still require the same Profile, institution, currency and account type. Unknown numbers require explicit replacement confirmation or a separate account; matching must not silently merge accounts. An ambiguous suffix requires a user-selected account. Older statements and provider masks must not restore retired numbers. A replacement also retains the bank link's original metered identity during provider-ID rotation.

Imports compare the history snapshot when updating identity, and bank sync/manual identity edits serialize against replacement confirmation. Delayed work fails safely rather than overwriting a newly confirmed replacement. Replacement itself does not enqueue merchant/category learning or mutate confirmed financial records.

The additive migration must be applied before the feature can save. The account API returns a temporary-unavailable response if its compatibility probe cannot find the history column. Native changes are prepared in source; no mobile binaries are part of this staging-only release.

Verification: `web/scripts/card-replacement-db-regression.ts` exercises the real API and worker on disposable PostgreSQL, including auth/origin/Profile isolation, confirmation, idempotency, concurrent conflicts, suffix collisions, masked history, old/new statement reuse, unknown-number rejection, repeated confirmation and source/confirmed-transaction preservation. `web/scripts/finverse-bank-journey-db-regression.ts` exercises provider responses through the real sync route, including retired/current/unknown numbers, provider-ID rotation and retained quota identity. Both are in the required parser release gate. Browser component QA covers cancel-without-save, a failed save followed by retry, and narrow/mobile/desktop layout.

Figma: main Screens, Accounts / Replace Card · Form, confirmation and history, node `2336:100755` in `FNnCmCj90szZAnZ6twMPCy`.
