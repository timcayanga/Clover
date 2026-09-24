# Clover plans — approved 24 September 2026

| Plan | PH monthly / annual | Global monthly / annual | Non-cash accounts | Profiles | Active budgets | Active goals | Circles created | Bank accounts linked | AI/month | AI/rolling 24h |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Free | Free | Free | 10 | 3 | 2 | 2 | 1 | 0 | 100,000 | 30,000 |
| Plus | PHP 169 / 1,259 | USD 7.99 / 59.99 | 20 | 10 | 5 | 5 | 5 | 2 | 1,000,000 | 250,000 |
| Pro | PHP 349 / 2,999 | USD 12.99 / 99.99 | 40 | 20 | 10 | 10 | 10 | 5 | 4,000,000 | 1,000,000 |

Plus is the previous Pro plan. Persisted `pro` and existing billing product IDs continue to mean Plus; `premium` identifies the new Pro. No existing subscription is repriced or automatically promoted. New Pro purchases require separately configured, validated provider products. Existing Plus Philippine Paddle prices remain USD 2.69 / 19.99, with the actual currency disclosed before checkout. App-store checkout uses provider-localized prices.

All limits aggregate across Profiles. Cash is excluded from the non-cash account count. Linked bank accounts also count toward the account limit; Finverse availability is independent of entitlement. Existing records are preserved on downgrade. Inactive budgets do not count. Saved personal goals count toward the goal limit; Circle limits count unarchived Circles you own, not accepted invitations.

AI-assisted cloud and on-device work share a token budget. No separate 50/500 request allowance. Offline devices must reserve tokens while online, preventing separate devices from each spending the entire allowance. Raw usage or a conservative documented estimate determines local charges.

Offline accounting: reserve at most 10,000 shared tokens per device, valid for up to 24 hours or the monthly reset. The reservation counts when issued in both server windows, and is not refunded on expiry. Current native APIs do not expose tokenizer counts: charge UTF-8 input bytes plus the enforced maximum 512 output tokens per model request, a conservative estimate. Legacy request-count clients must update before reserving shared tokens. Deterministic calculations/OCR/transcription do not call a language model and do not consume model tokens.

Paddle supports explicit Plus and Pro prices. See [Paddle tier configuration](paddle-tier-configuration.md) for environment mappings and the approved USD charges for Philippine checkout. The owner reused the former Paddle product for the current Pro tier with no existing live subscribers; explicit mappings supersede generic legacy IDs.
