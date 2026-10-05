# Account deletion

Account deletion is distinct from wiping app data. It requires the signed-in user's explicit confirmation or the existing protected Admin deletion flow. Tests must use synthetic data, never delete a real user's account to verify this implementation.

## Order and retries

1. Verify the deployment/Clerk/database environment and shared Circle ownership. Owners must transfer Circles containing other members' records before deletion.
2. Verify store ownership and cancel renewable Google Play and web subscriptions. Apple retains the existing separate cancellation/return-to-Clover acknowledgement flow. Server-verified recovered Apple aliases receive the same checks.
3. Record the identity deletion tombstone under the login/deletion lock. This prevents new logins or delayed Clerk updates from recreating the account. A retry after this point does not require a second Apple acknowledgement or repeat billing verification.
4. Revoke Finverse connections before removing their credentials. A provider failure retains the deletion intent and credentials for retry.
5. Delete the Clerk identity, temporary native upload parts, original import objects, and promotional evidence. Active native upload finalizers must finish or expire before cleanup. Storage failure retains the database pointers for retry.
6. In one transaction remove detached personal records, enqueue provider cleanup, and delete the local user and cascading app data. Mark the identity deletion complete only afterward.

`/api/cron/account-erasure` resumes pending identity deletions and provider jobs daily on the current Vercel plan (18:17 UTC, with the plan’s scheduling tolerance). Scheduled jobs run on production deployments; staging can verify the authenticated endpoint separately. Requests normally complete local deletion immediately; interrupted local/provider cleanup may wait until a later sweep. It requires `CRON_SECRET`, is environment-scoped, and uses bounded batches. `GET /api/admin/users/sync` exposes pending local count and up to 50 provider tasks to Admins with operate permission, including last error and retry time. Adding `?checkProviders=1` performs read-only provider credential checks; it does not test destructive permissions. Provider failures remain pending; they are not reported as successful erasure.

## Data covered

- User/Profile financial data, accounts, transactions, imports and parsed rows, learned merchant rules, budgets, goals, recurring items, investments, private conversations, notifications, offline mutation records, and other User/Workspace cascades.
- Stored source files, Switch to Clover evidence, native upload sessions and all possible chunks, including objects written before a lost acknowledgement.
- Admin snapshots, targeted support actions/notes/approval payloads, user-associated errors, notification delivery records, own referral checkout/payment/reward records, and Brankas notification payloads associated with the deleted user's sessions.
- Contact requests, messages and inline attachments matching the account's **verified** email in the same environment. An unverified email cannot erase support correspondence.
- Actor identifiers and raw metadata in another workspace's audit log are anonymized. Another member's financial history and earned referral reward are preserved. A referrer's reward keeps the minimal payment/checkout identifiers required for a refund reversal but loses its link to the deleted referred user.

## External cleanup

PostHog jobs use `POSTHOG_ERASURE_API_KEY` (or `POSTHOG_PERSONAL_API_KEY`), `POSTHOG_PROJECT_ID`, and `POSTHOG_APP_URL`. The key requires `person:read` and `person:write`. Lookup uses the existing environment-scoped Clerk/local IDs. Person UUIDs are checkpointed before deletion. Profile, event and recording deletion is requested; asynchronous event deletion is polled until the provider reports completion. A merged profile containing another live Clover identity requires manual separation and remains pending. Completion clears the task payload.

RevenueCat jobs require `REVENUECAT_SECRET_API_KEY` for v1 deletion and `REVENUECAT_RECOVERY_API_KEY` for v2 customer/alias reads. They wait through any active entitlement so paid-period recovery remains available. Erasure shares the purchase-recovery source lock, checks all aliases, and refuses to delete a customer tied to another live identity. Deletion acceptance is not completion; a later 404 confirms absence. Deleting a RevenueCat customer is not subscription cancellation, which happens earlier.

Provider cleanup starts at least one hour after local deletion so in-flight SDK events can settle. Missing credentials, insufficient scope, provider failures, or ambiguous identity results remain visible pending tasks. Before enabling in an environment, verify credentials and scopes with provider settings and read-only calls. Do not use a real user's DELETE request to test permissions.

## Limited retention and boundaries

- Identity tombstones prevent resurrection. Purchase-recovery proofs retain opaque identity IDs and a transaction hash, not financial files, passwords, receipts, or email addresses. Cleanup tasks retain provider/status/retry metadata; completed payloads are cleared.
- Staff access/security audit records and disabled staff entries remain for access-control accountability. An ordinary account's support/financial payloads are removed as above.
- Payment processors and Apple/Google may retain their own billing records. Paddle exposes archival rather than a customer-erasure API. Provider retention is not equivalent to Clover account data, and deleting an account must not be presented as erasing all processor records.
- Infrastructure backups, independent provider logs, already-sent support emails, and other users' legitimate shared records are not synchronously erased by this endpoint. Apply their retention schedules and provider privacy-request processes where appropriate; do not claim instant deletion of these copies.
- This change applies to new or pending deletion requests. Completed historical deletions whose local IDs/email were already removed require a separately scoped audit; never guess ownership by matching unrelated records.
