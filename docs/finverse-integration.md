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
5. Redeploy staging, open **Accounts → Add account → Connect**. Search the Finverse bank list and choose a bank. In test mode only supported test institutions are shown. After authorization, review and select the returned accounts before adding them.

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

The Connect tab is visible even when credentials are missing, with a clear unavailable message and Manual/Upload alternatives. Bank discovery is restricted to the existing Philippines rollout and accounts/transactions products. Do not infer live availability from the Figma sample banks.

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
