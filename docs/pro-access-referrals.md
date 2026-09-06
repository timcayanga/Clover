# Pro access and referral campaigns

## Admin workflows

- **Users → Plan & Access** shows the effective tier, access source, provider subscription status, verified paid-through date, renewal/cancellation dates, complimentary grants, and audit history.
- Grant Pro for exact start/end instants, edit a grant's dates, or revoke it. Changes require an explanation and record the administrator, before/after values, and time. Dates are entered in the browser's local timezone and stored in UTC.
- Provider billing dates are read-only. A complimentary grant does not cancel billing, delay a charge, issue a refund, or edit financial records.
- Legacy manual plan overrides remain authoritative and indefinite. Explicitly release the override to use subscription/grant-based access. Granting time while an override exists does not silently remove it.
- **Campaigns & Referrals** supports draft creation, eligibility previews, scheduling, activation, pausing, ending, immutable terms, duplication into a new version, reward counts, review decisions, and an audit history.
- Admin remains Clover's **production control plane**, including when accessed through staging. Never test a real customer grant or activate a production campaign as part of staging QA.

## Access calculation

The effective tier is resolved before returning authenticated user context. A non-renewing user keeps Pro until verified paid time and any contiguous complimentary grants expire. Future grants separated by a gap do not grant present-day access. Revoked grants do not contribute. No nightly job is required to enforce expiry.

Paid-through evidence is recorded from verified positive payments. PayPal's verified last-payment timestamp plus the configured billing interval supplies an end date when available; a future next-billing date alone is not paid evidence. Paddle uses the paid transaction's billing period. Unknown legacy dates remain unknown until a verified provider event/sync supplies evidence; they are not backfilled from guessed dates.

Calendar months use UTC month arithmetic with end-of-month clamping (January 31 → February 28/29). Successive rewards append to existing contiguous access, not to a disconnected future grant.

## Referral rules

The initial builder supports this bounded rule set, not arbitrary executable expressions:

- First paid Pro purchase by a different verified user; referrer must also be verified.
- Monthly, annual, or both billing intervals; optional country allowlist using the server's deployment country header.
- Reward amount: 1–12 calendar months.
- Payment review period: 0–90 days, default 14.
- Attributed checkout purchase window: 1–90 days, default 30.
- Optional reward redemption expiry; default no expiry.
- Per-referrer and total campaign reward caps. Exceeded caps enter Admin review rather than silently granting excess rewards.
- Campaign start/end dates and published terms.

New campaigns are drafts; no campaign is created or activated automatically. Publishing freezes rules and terms. A server-created checkout token snapshots the campaign, code, owner, buyer, provider, configured plan, country, terms, and expiry. Pausing prevents new attribution but honors already-issued, unexpired checkout snapshots. A new version gets new codes; existing participants retain their original terms.

Users access **Refer & Earn** from Plan & Access. They accept the immutable campaign terms before creating a code; acceptance is audited. Referral links preserve the code through sign-in and forward it to plan selection. Checkout validates the code on the server before opening the provider. Codes do not change the buyer's price.

## Reward lifecycle and billing

Verified positive payment → pending review period → available/banked → user activates → dated Pro grant.

An active paid subscriber banks rewards. To use banked time, the subscriber cancels renewal using the normal provider flow, then activates the reward; it starts after verified paid time and existing contiguous complimentary access. This applies to annual subscriptions too. This implementation intentionally does **not** promise a provider billing credit or automatically postpone renewal.

Provider payment IDs, unique reward attribution, database constraints, and transaction-level advisory locking prevent duplicate webhook deliveries or concurrent claims from issuing multiple rewards. Refunds/reversals received before the payment are retained as tombstones. An unclaimed reward is revoked after a refund/dispute; a claimed reward is flagged for Admin review, preserving its history. Revoking it in Admin revokes only its complimentary grant, not the customer's provider subscription.

## Deployment and launch checklist

1. Deploy the additive migration and application together. All new growth tables are server-only with RLS enabled and public/client role privileges revoked.
2. Verify configured PayPal plan IDs and Paddle price IDs match the relevant deployment environment.
3. Verify provider webhook subscriptions and signature configuration. Required PayPal events include subscription lifecycle events, `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`, and `CUSTOMER.DISPUTE.CREATED`. Paddle requires subscription lifecycle events, `transaction.completed`, `adjustment.created`, and `adjustment.updated`.
4. Complete provider-sandbox checkout, cancellation, renewal, and refund testing before activating a real campaign. Local fixture tests do not substitute for provider delivery and merchant-account configuration.
5. Review campaign eligibility, caps, cost exposure, and terms; then explicitly publish/schedule in Admin. No production campaign was activated during implementation.
6. Promote the tested staging commit before issuing real dated grants: the old production application cannot enforce the new access rules until deployed.

## Verification

`npm run qa:prepush` includes pure access/campaign regression checks through the billing lifecycle suite, type checking, release checks, and a production build.

`web/scripts/growth-integration-regression.ts` is opt-in and refuses to run unless the database is the disposable local `127.0.0.1/clover_growth_test` database and NODE_ENV is not production. It covers concurrent duplicate payments, self/cross-environment rejection, banked paid subscribers, manual overrides, hold/expiry, cancellation, stacking, paused-campaign snapshots, refunds in either order, caps, immutable terms, and audited Admin date edits.

The UI fixture harness exercises the actual React components and Admin route handlers against that database. It is not Clerk-authentication or provider-checkout end-to-end coverage. No production customer records are used.
