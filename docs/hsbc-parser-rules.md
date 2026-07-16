# HSBC UK Screenshot Parser Rules

## Scope

These rules cover HSBC UK mobile screenshots using GBP, including the products overview and account-information screens.

## Deterministic Rules

- Detect `Online Bonus Saver`, `Global Money Account`, `Bank A/C`, or known HSBC screenshot evidence as HSBC.
- Keep the sort code and eight-digit account number separate from transaction descriptions; store the eight-digit account number as the account identifier.
- Treat product overview balances as account snapshot markers, not transactions. A missing Global Money currency balance remains unknown rather than being converted to zero.
- Parse `ADDED GROSS INT` and `GROSS INTEREST` as positive GBP income in the `Interest` category.
- Parse `GLOBAL MONEY` credits as positive GBP transfers in the `Transfers` category.
- Preserve transaction codes such as `INT` and `GPC028LV2Z` in the raw payload.
- Accept both `Friday, 01 May 2026` and `May 01 2026` date layouts.
- Deduplicate overlapping mobile screenshots using date, amount, account, description, and the HSBC screenshot source key.

## Review Rules

- Product overview snapshots remain reviewable because they are balance evidence, not ledger activity.
- Do not infer balances for collapsed Global Money currency sections.
- Never treat the displayed interest rate or savings-goal copy as a transaction.
