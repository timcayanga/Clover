# Automatic signup Plus trial

This policy supersedes the original Free-default signup spec for newly eligible accounts. No trial checkout, payment method, subscription, automatic billing or provider-side trial is created. Internal `pro` is the public **Plus** tier; internal `premium` is public **Pro**.

## Eligibility and source of truth

- The migration creates the `signup-plus-v1` policy with a fixed database rollout timestamp. Only authoritative Clerk creation timestamps at or after rollout qualify; existing Clover records older than rollout are also excluded. Logging in for the first time after rollout does not enroll an old identity.
- `SignupTrial.userId` is unique. Its original start is the authoritative account creation timestamp; end is exactly 30 × 24 hours later, to the millisecond. It is account-wide and independent of Profiles and devices.
- Identity provisioning and webhook reconciliation use the same Clerk advisory transaction lock. Enrollment creates a uniquely keyed existing `ProAccessGrant`, source `signup_trial`, in that transaction. Retries cannot change dates or reverse a revocation. Account metadata records that eligibility was evaluated, avoiding repeat enrollment reads on ordinary requests. A temporary Clerk outage can defer evaluation until authoritative data returns.
- Financial-data wipes, signing out, Profile changes and connected login methods do not reset the ledger. Complete account deletion follows the existing erasure policy and removes the trial with the deleted identity; this is not an email-based, lifetime anti-abuse system.
- `getProAccess` and the native bootstrap/store-status APIs expose one trial snapshot with original dates, status, remaining days and whether the account relies on the trial. Trial access is neither a paying subscription nor an Admin complimentary grant in analytics.

## Billing precedence

Existing provider verification remains authoritative for Paddle, legacy PayPal, Apple and Google. A successful checkout UI or adding a card is not entitlement evidence. Failed/pending/abandoned checkout does not edit the trial. Checkout preparation blocks another verified active store or web subscription, including canceled subscriptions with paid-through access.

The highest valid entitlement continues. A paid Plus purchase gives Plus, a paid Pro purchase gives Pro. Canceling renewal retains verified paid-through access. If that paid period ends before the original trial, remaining original Plus time applies. Nothing restarts, stacks or extends the trial. Existing refunds/reversals and verified suspension revoke the trial durably, including when the refund arrived before trial enrollment; valid independent paid sources still follow existing policy.

Paid purchases use existing immediate/provider-defined charging. The UI states that unused trial days do not postpone billing or extend the paid period, and that expiry alone never triggers a charge. The Plan screen permits purchasing Plus even while Plus trial access is current. Trials can only be revoked in Admin; changing dates requires a separate complimentary grant instead.

## Banks and retained data

The standard Plus limits apply, including two **distinct financial accounts** combined across Profiles. Email verification is required before authorization. Existing stable account matching, per-owner quota locks, active-link limits and usage reservations remain in force.

The trial has one fixed allocation window from original start to original end, with no monthly or anniversary reset. Unlinking/deleting cards does not release used slots; recognized relinks do not use a second slot. Transition to paid access carries trial reservations into the overlapping paid window and seeds active links using the existing paid policy. Returning to a remaining trial carries paid-window reservations back; it cannot create an extra two slots. Reduction from Pro uses existing retention selection and durable login-identity revocation.

At expiry, server entitlement calculations and quota boundaries stop trial access immediately, including bank-sync and cloud-parser quota checks. Scheduled processing refreshes inactive accounts and queues bank cleanup. Expiry remains pending until bank allowances are reconciled, including retries after an interruption between saving the effective tier and queuing revocation. The existing Finverse lifecycle retains credentials until the provider confirms revocation, retries failures and clears them only after success. Access-token-only authorizations are also queued. Disconnection can be pending after access ends; no notification claims it already succeeded. Existing cards retain the last successful sync date.

No trial path deletes financial history, imports, receipt details, categories, learned rules, goals, budgets, Circles or investments. Existing downgrade policy keeps excess records accessible and only limits additional creation/reactivation. Consumed AI usage is not reset.

## Reminders and configuration

`/api/cron/signup-trials` uses the existing `CRON_SECRET` authentication and runs daily at 01:07 UTC (09:07 Asia/Manila) in the existing Vercel project, compatible with its current Hobby plan. Effective access still expires at the original exact timestamp in request and worker quota checks. Inactive-user reconciliation, provider-disconnection processing and notices run at the next daily sweep; a more frequent automatic cadence requires a Vercel plan that supports it. Failed emails retain retry metadata, but retries still require a run within the current milestone window; stale countdowns are never replayed. Runs process bounded batches and retain a cursor for notice cohorts; bank cleanup uses the existing durable queue. Preview cron scheduling is not automatic on Vercel: staging exercises the handler with test identities, while the production schedule becomes active only on an authorized future production deployment.

Notices occur during the seven-day window (7–6 days left), one-day window, and first 24 hours after expiry. Delayed jobs do not burst old reminders. Before delivery the current trial, paid access, verified email, Admin template controls and notification preferences are checked again. Valid paid subscriptions suppress reminders. If another grant continues paid features, expiry copy names the actual effective plan rather than saying Free. Date labels follow Clover's Asia/Manila convention and show the exact date/time.

Uses existing SMTP configuration (`ZOHO_SMTP_*`), mail transport, notification templates, read/dismissal storage, notification preferences and email-delivery ledger. The new `signup-trial` template is enabled by default, but the user's email preference still controls delivery. Default email-off preferences are respected. Web/native notification destinations use `/settings?section=plan`. Branded responsive HTML and plain text are both generated.

The ledger uniquely identifies each account/trial/milestone. Parallel runs claim once. Definite transient pre-acceptance failures have bounded backoff within the current milestone; permanent SMTP rejection records a terminal outcome. An interrupted sender or ambiguous SMTP timeout is marked `uncertain` and must be reconciled before manual retry, because SMTP has no guaranteed idempotency API. No financial data or rendered financial message bodies are stored in this ledger. Trial expiry never depends on SMTP success.

## Migration and verification

Migration: `20261023020000_signup_plus_trial` adds server-only, deny-by-default RLS tables `SignupTrialPolicy`, `SignupTrial`, one nullable eligibility-evaluation timestamp on User, and retry/lease/outcome metadata on the existing notification-email ledger. It grants no existing account retroactive access and does not alter paid subscriptions or financial records.

Meaningful coverage:
- `qa:plans` includes `signup-trial-regression.ts`: exact boundaries, tiers, cancellation/remaining trial, pending checkout, fraud revocation, reminder windows, paid/preference suppression, parallel notice deduplication, retries and ambiguous-send handling.
- The guarded disposable PostgreSQL release gate includes `signup-trial-db-regression.ts`: actual parallel enrollment and grant uniqueness, cross-Profile allocation locks, relink reuse, fixed window, paid carryover, inactive-user expiry, provider-revocation intent, preserved confirmed records and revoked-replay protection.
- Existing billing, store, bank lifecycle, notification SMTP and native plan-change tests remain required. They use sandbox/mock providers or loopback SMTP and no customer identities or actual bank authorizations.

Delivery scope: staging only for this trial feature. No production rollout or new mobile binaries requested. Native presentation changes require a future authorized binary release; the server entitlement itself works through existing APIs.

## Dependency security discovered during this change

The required gate identified GHSA-mrhx-c7xc-m3w5 while this feature was under test. Web upgrades its existing Zod 4 dependency to 4.6.7. The integrated staging update pins mobile's transitive Zod dependency to the upstream-patched 4.6.6 and checks real Expo plugin/MCP schemas, ABI consumers, rejected inputs and leading collection-size limits. The temporary mobile backport was removed in favor of that upstream fix. Existing dependency security gates remain required. This is source/dependency verification, not a new native binary.

The standalone disposable migration replay applies the actual SQL to the preceding Git schema, asserts RLS is enabled, then runs the database lifecycle fixture. Native/web trial summary and the branded email are also rendered with synthetic values for visual inspection; that preview is not an authenticated purchase or physical-device test.
