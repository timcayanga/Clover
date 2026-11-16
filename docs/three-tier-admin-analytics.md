# Free / Plus / Pro analytics and Admin rollout

24 September 2026. Deploy to staging; production remains a separate user deployment of the tested commit.

## Identity and plan vocabulary

Database tiers remain `free`, `pro` (Plus), and `premium` (Pro). New analytics use public `free`, `plus`, `pro`, with `plan_schema_version: 3` and explicit internal tier properties. Historical events are not rewritten; the Admin breakdown translates legacy tiers when reading. Server billing events resolve the same Clerk identity used by web and native analytics.

Web identity refresh and native bootstrap attach effective plan, access source, provider, paid-subscription status, complimentary/manual/test flags. Paid status is independent from granted access. Existing device, OS, app version/build, browser, environment and privacy protections remain in place. No financial record contents are added to analytics.

Checkout includes the chosen tier. Provider-confirmed transitions record purchase, renewal, cancellation, expiry and refund; native restore records its verified outcome. Generic access changes and Admin grants/overrides have separate events. The Admin Analytics table groups recent events by plan, provider and platform. Missing PostHog query access shows unavailable, never a fabricated zero.

## Admin behavior

- Users and Analytics show Free, Plus and Pro separately. These are access counts, not paying-customer counts.
- Complimentary grants select Plus or Pro, with start/end dates, reason and audit history. Existing grants default to Plus. Highest active tier wins; a lower-tier subscription does not extend a higher-tier grant.
- Manual plan edits require entitlement permission. They do not cancel or rewrite provider subscriptions. Removing an override returns to verified billing and grants.
- User access details show provider billing, native product/store/environment, effective allowances, monthly and rolling 24-hour token usage, and any account limit override.
- CSV exposes the persisted value as `planTierInternal` alongside the human-readable plan label.

Migration `20260924110000_tiered_access_grants` is additive. Existing grants retain Plus behavior; confirmed financial records are untouched.

## Design and release

Existing light/dark desktop/mobile Admin Billing and Analytics designs in Figma's Connect & Platform page reflect the three tiers, AI-token usage and billing-safe grants. No new native binary is produced in this task.

Required checks include `qa:plan-admin`, `qa:analytics`, `qa:billing-lifecycle`, `qa:store-tiers`, web/mobile type checks and the full `qa:prepush` gate. Store purchase verification remains pending fresh native test builds. HTTP 200 RevenueCat TEST deliveries are already confirmed separately.

For production, deploy the tested staging commit with Production environment variables and the normal migration/build pipeline. Do not simply alias a Preview artifact built with staging credentials. This change needs no new analytics environment variables; it reuses the existing PostHog capture/query configuration. Native changes require a later app build; native sales remain separately gated.
