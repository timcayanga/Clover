# Finverse bank connection

Clover uses Finverse's Bank Data API to connect accounts and import transactions. Paddle remains the billing provider.

## Sandbox setup

1. Create or open the Clover application in the Finverse Developer Portal.
2. Copy the application's client ID and client secret.
3. Register `https://staging.clover.ph/api/integrations/finverse/callback` as an exact redirect URI.
4. Add the following Vercel Preview variables scoped to the `staging` branch:
   - `FINVERSE_ENABLED=true`
   - `FINVERSE_MODE=test`
   - `FINVERSE_CLIENT_ID`
   - `FINVERSE_CLIENT_SECRET`
   - `FINVERSE_REDIRECT_URI=https://staging.clover.ph/api/integrations/finverse/callback`
   - `FINVERSE_TOKEN_ENCRYPTION_KEY` (a 32-byte base64 value from `openssl rand -base64 32`)
5. Redeploy staging, open **Accounts → Add account → Connect**. Choose the country where the account is held, then a bank. In test mode only eligible test institutions are shown. After authorization, review and select the returned accounts before adding them.

## Data behavior

- Finverse credentials and tokens never reach browser code.
- Login tokens are encrypted with AES-256-GCM before database storage.
- Raw provider accounts and transactions are stored separately from Clover's normalized records.
- New transactions enter Clover as suggestions for review.
- Subsequent syncs do not overwrite the linked Clover transaction, preserving confirmed data and user edits.
- If a linked Clover account or transaction is deleted, a later sync retains the provider audit record and does not silently recreate it.

## Live rollout

Finverse uses `https://api.prod.finverse.net` for both test and live credentials. Obtain separate live credentials and approval from Finverse, register the production callback URI, set `FINVERSE_MODE=live` and the live secrets in Vercel Production, then test with a low-risk account before broad release.

## Native return and availability

The iOS/Android store-test apps open the provider in the system authentication browser. The existing HTTPS callback verifies one-time state, then redirects native sessions to the fixed `clover://accounts` route. No arbitrary return URL is accepted. The native gateway exposes only authenticated institutions GET and link/sync POST operations; workspace ownership and plan quotas are reused from web.

The Connect tab is visible even when credentials are missing, with a clear unavailable message and Manual/Upload alternatives. Bank discovery uses Finverse’s current country memberships across Hong Kong, Indonesia, Malaysia, Philippines, Singapore and Vietnam, and requires both Accounts and Transactions products. Do not infer live availability from the Figma sample banks.

Refreshes update raw/normalized provider audit payloads without overwriting existing confirmed Clover account balances. Newly returned accounts require user selection before import; transactions enter review as suggestions.

## Account preservation and unlinking (25 September 2026)

- Match the stable Finverse account ID across authorizations first. Otherwise reuse a uniquely matching Clover account in the same Profile using bank identity, currency, account type and full number or a length-preserving mask with at least four visible digits. Ambiguous matches stop for review; never merge confirmed records by last four digits alone.
- Fetch full numbers from Finverse's `/account_numbers/{account_id}` product when available. Preserve existing full numbers and user metadata. Do not strip masking characters and present the remaining digits as a full number. Ignore parent aggregate accounts to avoid counting their subaccounts twice.
- Store bank balance snapshots in the provider audit payload. Home, Accounts, Account Details and native report projections use the snapshot without changing the saved opening balance or replaying historical transactions on top of it.
- Serialize imports with the owner's advisory quota lock. Deduplicate provider transaction IDs across connections; preserve deleted-record tombstones. For statement/manual overlap, match one occurrence by account, currency, booked date, amount, direction and normalized text. Preserve existing categories and confirmed edits. Ambiguous overlaps enter review and remain excluded from financial totals until explicitly confirmed. Pending provider transactions wait until booked.
- Plus allows 2 distinct connected accounts and Pro 5 per monthly subscription anniversary (annual plans also have monthly allowances). `BankLinkUsage` is retained independently of the connection. Unlink and account deletion do not free that period's slot. Relinking the same stable account ID consumes no extra slot; active accounts carry into the next period. Authorizing Finverse is allowed at the limit so an existing account can be reconnected; selection enforces the limit atomically.
- Unlink is available in Account Details and Add Transaction → Sync on desktop, mobile web, iOS and Android. It preserves the Clover account, transactions and snapshots. Unlinking one account leaves other accounts under that authorization active. Unlinking the last account revokes the Finverse identity and clears its encrypted credentials. Free users can unlink existing accounts but cannot sync.

Provider reference: https://docs.finverse.com/ and the official Finverse Accounts / Account Numbers API descriptions.

## Connection lifecycle (25 September 2026)

- Effective entitlement changes queue connections over the new active-account allowance. Users can preselect two accounts to retain on Plus from Manage connected banks; otherwise the latest successful sync wins, with stable ID ordering for ties. Free revokes all authorizations. Scheduled future cancellations do not remove access before its effective end.
- Provider revocation is per login identity. If one authorization contains both retained and excess accounts, the whole authorization is revoked. Historical cards remain; the user reconnects and selects only the retained accounts. Clover does not claim a child-account unlink has stopped provider billing.
- Disconnect intent is durable (`disconnect_pending`). Failed provider revocations retain encrypted credentials, record retry/error metadata, and retry with backoff. Repeated successful disconnects are idempotent. Provider 404 means already revoked; authentication errors are not treated as successful revocation.
- The authenticated daily notifications cron runs lifecycle cleanup, with background attempts after entitlement changes and immediate attempts for manual disconnect. Overdue connections receive at least fourteen days' rollout notice before inactivity revocation. Inactivity is 90 days since the last successful sync (creation if never synced), with in-app warnings at 14 and 3 days. A provider failure gets a bounded 14-day repair grace period. Email for the Bank connection lifecycle template can be enabled in Admin; it is not silently enabled.
- Authorizations abandoned without selected accounts are cleaned up after 24 hours. Deleting the final Clover account schedules provider revocation; deletion never substitutes for confirmed revocation. Existing financial deletion semantics remain unchanged.
- Reconnecting a deliberately deleted account requires explicit selection. The bank selection screen offers compatible existing cards by bank, currency and type. Changing a mapping does not merge or rewrite old confirmed transactions. Monthly used slots and current active-link limits are both enforced, including previously reserved accounts.
- Account Details keeps the newest bank snapshot through background cache refreshes and metadata edits, and labels disconnected snapshots with their last sync date. Bank-sourced balances are not editable as if they were an opening balance.
- Admin exposes account counts separately from provider connection counts, pending/failed revocations, retry times, last sync and inactivity deadlines. Provider billing units remain unconfirmed.
- This work requires the `20260925120000_finverse_lifecycle` migration. No production bank credentials or financial records are changed by local regression tests.

## Mixed-source import safety and refresh cap (27 September 2026)

- Each connection permits four explicit refresh attempts in a rolling 24 hours across all clients. Reservations are durable audit entries serialized by a database advisory lock. Failed refresh attempts consume a slot. The fifth request returns HTTP 429 with a Retry-After header and retryAt timestamp, before contacting Finverse. Status polling, account selection and reading already-retrieved data do not consume refresh slots. Initial authorization is separate from this refresh cap.
- Statement imports after bank sync match provider-backed transactions one occurrence at a time by account, date, currency, amount, direction and normalized merchant/description evidence. Exact matches retain the original ledger row; uncertain same-value overlaps enter review, excluded from totals. Source parsed rows remain available for audit.
- Bank sync and statement confirmation share the owner's serialization lock. Re-importing a confirmed or edited transaction does not replace any core fields.
- Manual entry is an explicit user action on the selected account. It remains possible after sync; it is not automatically merged away. A synced bank balance remains a dated provider snapshot, not a guarantee that later manual entries have reached the bank.

## Country and bank catalogue policy (28 September 2026)

- The authenticated Institutions API is the availability source. The old website/deck brand allowlist and Citibank country exception no longer gate discovery.
- Show SUPPORTED and BETA connectors only; both must advertise ACCOUNTS and TRANSACTIONS. Hide ALPHA and accounts-only/payment-only connectors. Keep real/test tags isolated by FINVERSE_MODE.
- Show only countries with at least one eligible connector, alphabetically, with flags and names. Country means where the bank account is held.
- Known institution IDs map to a bank brand for display only. Group within the selected country. Unknown institution IDs remain separate until their brand identity is reviewed.
- A bank tile summarizes Personal, Business, or Personal & Business. Multiple connectors open access choices; each retains its exact provider ID. Two business portals (such as UOB and UOB Singapore) retain the provider’s distinct names.
- A single SUPPORTED connector opens directly. BETA status is attached to the connector; selecting it requires a Continue action after the reliability note. A tile is labelled Beta when all its eligible connectors are Beta.
- The same picker policy applies to Add Account and the unlinked-account Sync path on desktop/mobile web and iOS/Android. Existing linked accounts, financial data, access limits and synchronization behavior are unchanged.
- Staging remains test mode. Real-bank visual QA uses a read-only catalogue snapshot; do not switch environments merely to populate a preview.

### Discovery loading performance

The country/bank catalogue is cached in server memory for five minutes, scoped to
Finverse client credentials and live/test mode. Concurrent requests share a single
provider fetch. Expired/failed loads retry; admin catalogue exports and link-time
bank validation request fresh provider data. Cold server instances still fetch it.
No user account data or plan entitlements are included in this cache.

Web and native Sync use `connections?view=picker` for fresh access and linked-account
metadata, independently of the institution catalogue. This skips lifecycle history
queries; plan and account reads run concurrently after workspace authorization.
Add Account skips the unused connections request. Per-account Sync skips the
catalogue entirely. All account responses remain private/no-store.

### Authorization and account-selection experience (28 Sep 2026)

Returning from Finverse opens the existing Add Account modal/sheet directly into
bank-authorization progress, then account selection. Authorization alone is not
labelled as an account being linked. Choose later leaves a server-backed Finish
linking action in Accounts and at the top of Connect/Sync. In-app notifications
resume the same workspace/connection on web and native; no email is sent for this
reminder. A bounded post-callback observer can mark initial discovery ready after
the sheet closes, without importing accounts or transactions. If retrieval takes
longer or the provider fails, the persistent action resumes the check.

Connect shows existing linked accounts below its country/bank picker; Sync shows
them first. Both include masked account numbers, connection status, Last Synced,
Sync and secondary account actions. Unlink confirmation lists the accounts sharing
that login and explains retained history and monthly slots. Per-account Sync in
Account Details uses the same controls. Sync completion reports new transactions
or Already up to date. Temporary errors offer Retry; expired provider authorization
offers Reconnect bank. Financial reconciliation and quota rules are unchanged.

Figma: bank linking states, section `1802:100376` in file `FNnCmCj90szZAnZ6twMPCy`.
Validation: Finverse route/discovery and preservation regressions; native notification
routing; web/native type checks; local browser fixture exercised callback progress,
choose-later/resume, linking completion, and shared-login unlink confirmation.
