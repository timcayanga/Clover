# Store readiness — 27 September 2026

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1760-563839

## Implemented

- iOS Apple sign-in uses Clerk's native Apple hook, activates the returned session, keeps email/Google and the existing signup terms gate. Android remains Google/email. Native plugin capability and Expo Apple Authentication module are enabled; a replacement iOS binary/signing capability is required to exercise this on a device.
- Account-level, versioned OpenAI permission is stored with server timestamps. Consent writes are authenticated; ordinary preferences cannot forge consent metadata and retain it when changed. Users can withdraw permission in Privacy and Data Use. Each external import/OCR or Adviser request rechecks permission; absence, withdrawal, old versions, and database errors block transmission. Background import retries use the Profile owner's permission. Deterministic parsing remains available. Split-bill receipt fallback is covered too.
- First-use permission prompts on web and native. No permission dialog for bank connection alone. Cloud consent is separate from the existing Adviser-context preference.
- Native Plan has Terms/Privacy links beside renewal terms for both Free and paid users. Store management returns refresh verified entitlements. Purchases remain hidden for paid accounts to avoid a second subscription checkout.
- Public Contact Us has an anchored deletion request section at `/contact-us#delete-account`, using the existing support inbox and ownership verification workflow. This does not delete anything automatically. Retention text follows the existing policy; Apple/Google subscriptions require separate cancellation.

## Verification boundaries

- `qa:ai-consent`: fixture tests for grant, withdrawal, versioning, metadata integrity, preservation of unrelated preferences, audit, no outbound parser/OCR calls without consent, and fail-closed database errors.
- `qa:store-tiers`: all eight native products; Plus/Pro transitions, scheduled cancellation keeping paid access, expiry, renewal, refund, overlapping entitlements, account ownership, sandbox isolation and webhook authentication. These are simulated provider responses, not actual purchases.
- Full quality gate and staging visual checks are recorded in the final task report.
- No production changes, real purchases, account deletions, or provider-side subscription mutations are part of this change.

## Still requires installed store-test builds

Use TestFlight/Apple sandbox and Google Play internal testing with license testers. On both stores: buy Plus, verify RevenueCat identity and Clover tier, change to Pro, verify displayed effective date and final charge, schedule Plus downgrade, verify Pro remains until the store's effective date, then verify Plus. Test cancellation, accelerated renewal, expiry, restore on reinstall/same account, account-switch protection, refund/revocation, and failure/retry. Confirm only one active subscription per store account/group. Record store transaction IDs privately and sanitized event IDs/results in QA notes.

Production Clerk Apple is already documented as configured for web; native bundle registration and staging Clerk Apple configuration still require live verification. Do not treat compiling the Apple hook as a successful login.
