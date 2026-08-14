# Finverse bank connection

Clover uses Finverse's Bank Data API to connect accounts and import transactions. Paddle remains the billing provider.

## Sandbox setup

1. Create or open the Clover application in the Finverse Developer Portal.
2. Copy the application's client ID and client secret.
3. Register `https://staging.clover.ph/api/integrations/finverse/callback` as an exact redirect URI.
4. Add the following Vercel Preview variables scoped to the `staging` branch:
   - `FINVERSE_MODE=test`
   - `FINVERSE_CLIENT_ID`
   - `FINVERSE_CLIENT_SECRET`
   - `FINVERSE_REDIRECT_URI=https://staging.clover.ph/api/integrations/finverse/callback`
   - `FINVERSE_TOKEN_ENCRYPTION_KEY` (a 32-byte base64 value from `openssl rand -base64 32`)
5. Redeploy staging, open Accounts, and select **Connect bank**. In test mode Finverse displays its supported test institutions.

## Data behavior

- Finverse credentials and tokens never reach browser code.
- Login tokens are encrypted with AES-256-GCM before database storage.
- Raw provider accounts and transactions are stored separately from Clover's normalized records.
- New transactions enter Clover as suggestions for review.
- Subsequent syncs do not overwrite the linked Clover transaction, preserving confirmed data and user edits.
- If a linked Clover account or transaction is deleted, a later sync retains the provider audit record and does not silently recreate it.

## Live rollout

Finverse uses `https://api.prod.finverse.net` for both test and live credentials. Obtain separate live credentials and approval from Finverse, register the production callback URI, set `FINVERSE_MODE=live` and the live secrets in Vercel Production, then test with a low-risk account before broad release.
