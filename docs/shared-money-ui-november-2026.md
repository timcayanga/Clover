# Shared-money UI refresh — 5 November 2026

Scope: staging only; no production deployment or installable mobile packages.

- Add method selectors use shared 3D Manual, Upload and Sync artwork. Existing bank connector IDs, access types, authorization and reliability warnings remain intact; Beta badges are hidden. Selected countries remain in a highlighted horizontal row.
- Existing Circles omit the directory introduction and shared-this-month label. Circle photos lead the card at the top left.
- Bill balances use people rows with avatars and Paid, Share and Owed columns. Recorded contributions and completed settlements are individual rows. Who Pays Whom remains the outstanding-payment proposal, never a claim that someone paid.
- Contribution destinations are optional shared labels, not links that expose a member’s private bank account. Existing contribution records remain unchanged. The existing optional contribution date continues to use regional date settings.
- Payment requests show the receiving person separately from the person asked to pay. Payment-option names show the institution then the saved nickname, suppressing exact duplicates. New payment options are available inside the dropdown.
- A foreign-currency request uses a manually agreed amount. The requester explicitly enters the original bill amount it settles. `billAmount` and `billCurrency` retain that mapping independently of request `amount` and `currency`. No exchange-rate conversion or bill edit happens automatically. Related-bill batching remains available only in the original currency.
- Same-currency requests from older clients remain supported without the new fields. Foreign requests without a valid mapping, changed bill currencies, unsupported request currencies, over-requesting and mismatched payment-option currencies are rejected. Paid requests cannot be reopened. Request confirmation and retry use a bill-level database lock and one transaction to avoid duplicate settlements.
- Public links label receipt line items in the original bill currency and display both agreed and original amounts when different. Mobile responses include only the necessary payment and settlement history fields.

Validation includes real request HTTP handlers against isolated persistence, original-currency reservation/settlement, retry and paid-state checks; shared-currency, Circles, Finverse preservation and native response projection regressions; web/native type checks; and responsive rendering of the actual components with synthetic data. No customer financial records are changed for QA.
