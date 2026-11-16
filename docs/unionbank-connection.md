# UnionBank sandbox connection readiness

The developer application is Clover Sandbox. The user confirmed subscriptions to
UnionBank Identity API (authentication), Online Bank Account Information,
Customer Balance, and Customer Account Transaction History, and saved the four
UnionBank environment variables in Vercel. Their values and deployment scope
have not been independently verified.

## Run the test

For testing while the bank login page is unavailable, use **Create test account
and check balance** on the same page. This calls POST /sandbox/v1/accounts and
GET /accounts/v2/balances/{accountNumber} with application credentials only.
Use subscriptions Sandbox Bank Account and Sandbox Account Balance. Sandbox
Account Information still requires a customer token, so it is not part of this
direct test. This is a separate check from the OAuth test below.

The direct test generates dummy credentials and encrypts its result in Redis
with AES-256-GCM, with a key derived from the server-only client secret and an
actor-specific context. It retains successful or uncertain creation for 24 hours
to reuse the same account across repeat clicks. Definite creation rejections are
cached for one minute before allowing a new explicit attempt. The record is
reserved before the bank call, so concurrent clicks cannot create duplicates.
If the worker stops mid-request, the preserved pending record and credentials
remain available; it will not silently retry account creation. Users should save
the dummy login details before expiry. Credentials are never logged or included
in Clover's finance data. Changing the application secret makes cached results
unreadable until they expire. Balance lookup failures do not repeat creation.

Deploy the connector code to the deployment serving staging.clover.ph. Set these
server-only variables there (never NEXT_PUBLIC_):

- UNIONBANK_ENV=sandbox
- UNIONBANK_CLIENT_ID and UNIONBANK_CLIENT_SECRET from Clover Sandbox
- UNIONBANK_REDIRECT_URI=https://staging.clover.ph/api/bank-connections/unionbank/callback
- REDIS_URL: Clover's Redis connection, required for one-time OAuth state and temporary results

Sign in with a customer Clerk account and open
https://staging.clover.ph/settings/bank-connections/unionbank.
Use a dummy UnionBank account from the bank's Sandbox Accounts documentation.
The page tests customer login, account identification, balance, and credit/debit
history. It stores only per-check results for ten minutes, scoped to the Clerk
user. It never persists tokens or writes Accounts, Imports, or Transactions.
The shared staging guest and remembered-session fallback are not accepted.

The callback must exactly match the developer application's redirect URI. A
registered redirect URI alone does not deploy a callback. OAuth state is bound
to a secure HttpOnly browser cookie and the authenticated user, expires in ten
minutes, and is consumed atomically before exchanging the authorization code.
The browser must return by GET with its same-site-lax cookie. Other response
modes require separate implementation and verification.

## Verified reference, not yet verified against sandbox

Source: https://developer.unionbankph.com/reference (checked 2026-09-29).
The sandbox base is fixed to https://api-uat.unionbankph.com/partners/sb.
The hostname contains UAT, but the /partners/sb path is the documented sandbox.

- Customer authorization/token: /customers/v1/oauth2/authorize and /customers/v1/oauth2/token.
  The test requests account_inquiry with type=single, rather than a long-lived link.
- Online Bank Account Information: POST /customers/v1/accounts/info, partner
  token with account scope and customer token response metadata as sessionToken.
- Partner token: /partners/v1/oauth2/token, using the bank's published dummy
  partner_sb credentials and partner ID. These public fixtures are sandbox-only.
- Balance: /portal/accounts/v1/balances, from the official curl example. The
  reference also lists /balances in its heading; failures must be investigated.
- History: /portal/online/accounts/v1/transactions; test both C and D, published
  fixture range 2017-01-01 through 2017-12-31 and limit=4.

Do not interpret a successful sample response as proof of complete history or
production eligibility. Validate scopes, metadata shape, supported account types,
pagination/date limits, duplicate detection, ongoing consent, token renewal and
revocation with UnionBank before implementing persistent sync. Production access
requires the bank's onboarding approval. This test intentionally cannot switch to
production through an environment variable.

## Verification

From web/: npx tsx scripts/unionbank-sandbox-regression.ts.
Also run: npx tsx scripts/unionbank-sandbox-account-regression.ts.
This uses mocked HTTP responses; a real sandbox login remains necessary.
Do not log callback query strings, token request bodies, credentials or responses.
