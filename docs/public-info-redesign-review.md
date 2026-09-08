# Contact and legal page refresh — September 7, 2026

## Implemented

- Contact, Privacy Policy, and Terms of Service share the current JourneyHeader
  and PublicFooter, Raleway/Poppins typography, teal accents, quiet mint surfaces,
  responsive cards, and keyboard focus indicators.
- Contact keeps the existing `/api/contact-us` storage/email path. It adds
  attachment safety guidance, accessible field errors, failure preservation,
  attachment reset after success, and support-resource links. The response window
  is an aim rather than a guaranteed SLA.
- Full legal text remains visible and searchable, with summary cards, section
  anchors, desktop contents, mobile reflow, and print styles. Canonical metadata
  preserves the existing route URLs.
- Billing copy now recognizes Paddle and PayPal, provider-specific cancellation,
  regional checkout terms, time-limited grants, and provider refund policies.
  It no longer promises immediate Free downgrade for every cancellation or
  automatic cancellation of every provider on account deletion.

## Before publishing the revised legal text

This is an implementation/content draft, not a legal compliance certification.
Have the owner and qualified Philippine counsel review the legal copy, including:

1. Replace the existing generic operator description with the correct legal
   operator name and business/contact address. These were not supplied; do not
   invent them. Confirm the privacy contact or designated DPO details.
2. Approve the revised effective date and required notice to existing users.
   The local draft shows its September 7 content-update date, not evidence that
   users have received notice or accepted revised terms.
3. Confirm the existing children/guardian eligibility language, liability cap,
   governing law, international transfers, provider disclosures, no-sale claim,
   analytics practices, and retention/backup obligations. These provisions were
   preserved, not independently certified.
4. Confirm live checkout/provider settings and campaign terms. No store billing,
   RevenueCat availability, bank connection, or new financial capability is promised.

## Evidence and references

- Local `/api/billing/paddle/portal` and `/api/billing/paypal/cancel` support
  provider-specific management; imports assign a 72-hour raw-expiry timestamp.
- [Paddle cancellation documentation](https://developer.paddle.com/build/subscriptions/cancel-subscriptions/)
- [Paddle Refund Policy](https://www.paddle.com/legal/refund-policy)
- [NPC: right to be informed](https://privacy.gov.ph/the-right-to-be-informed/)
- [NPC: data-subject rights](https://privacy.gov.ph/data-subject-rights/)

## Verification

Run `node scripts/public-info-browser-check.mjs` from web with AGENT_BROWSER_BIN
and optionally PUBLIC_INFO_TEST_URL. It checks five viewport sizes, 200% text
size, headings, section links, overflow, footer presence, and browser error
overlays. Contact transport is mocked to test failure, retry, payload, and success
without storing a support inquiry or sending email. This does not re-certify the
unchanged database/SMTP delivery path.
