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
