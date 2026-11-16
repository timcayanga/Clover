# Clover plans — approved 24 September 2026

| Plan | PH monthly / annual | Global monthly / annual | Non-cash accounts | Profiles | Active budgets | Active goals | Circles created | Bank accounts linked | AI/month | AI/rolling 24h |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Free | Free | Free | 10 | 3 | 2 | 2 | 1 | 0 | 100,000 | 30,000 |
| Plus | PHP 169 / 1,259 | USD 7.99 / 59.99 | 20 | 10 | 5 | 5 | 5 | 2 | 1,000,000 | 250,000 |
| Pro | PHP 349 / 2,999 | USD 12.99 / 99.99 | 40 | 20 | 10 | 10 | 10 | 5 | 4,000,000 | 1,000,000 |

Plus is the previous Pro plan. Persisted `pro` and existing billing product IDs continue to mean Plus; `premium` identifies the new Pro. No existing subscription is repriced or automatically promoted. New Pro purchases require separately configured, validated provider products. Existing Plus Philippine Paddle prices remain USD 2.69 / 19.99, with the actual currency disclosed before checkout. App-store checkout uses provider-localized prices.

All limits aggregate across Profiles. Cash is excluded from the non-cash account count. Linked bank accounts also count toward the account limit; Finverse availability is independent of entitlement. Existing records are preserved on downgrade. Inactive budgets do not count. Saved personal goals count toward the goal limit; Circle limits count unarchived Circles you own, not accepted invitations.

AI allowance policy updated 4 October 2026: only cloud AI consumes the monthly and rolling 24-hour token budgets. Deterministic Clover parsing, device OCR, device models, manual review, and saving confirmed results do not use cloud tokens. An exhausted cloud allowance stops cloud calls, not basic import admission or local work. Other plan limits and file safety checks remain in force.

Failed AI extraction does not count toward either allowance. Preserve the original provider-usage audit and append an idempotent credit keyed to that audit record. Apply the credit to the original request's time windows. Historical failed imports with no saved transactions are reconciled automatically when usage is read. A successful extraction is not refunded just because a later optional enrichment step fails.

Installed native clients that still require a device grant receive a separate compatibility grant, never deducted from cloud usage. Current clients execute supported on-device models without an online reservation. Device availability, memory, and OS restrictions still apply; local AI suggestions remain reviewable and cannot silently confirm financial records.

Paddle supports explicit Plus and Pro prices. See [Paddle tier configuration](paddle-tier-configuration.md) for environment mappings and the approved USD charges for Philippine checkout. The owner reused the former Paddle product for the current Pro tier with no existing live subscribers; explicit mappings supersede generic legacy IDs.
