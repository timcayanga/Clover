# PDAX Screenshot Parser Rules

## Scope

These rules cover PDAX portfolio, fiat wallet history, and `Others` rewards screenshots. PDAX is distinct from GCrypto even though both can use PDAX infrastructure.

## Deterministic Rules

- Parse visible crypto holdings as investment snapshot markers with symbol, PHP market value, and quantity.
- Skip cropped holdings when a complete asset name, market value, or quantity is not visible.
- Parse Fiat `Cash In` and `Cash Out` entries as PHP income/expense transfers, preserving the provider description and status.
- Parse `Successful`, `Pending`, and `Failed` statuses into raw evidence; pending and failed entries remain review-required.
- Parse `Others` entries such as `PDAX Employee De Minimis` and `Rewards` as PHP income.
- Deduplicate overlapping wallet-history screenshots using date, time, direction, description, amount, and PDAX screenshot source.

## Data Integrity

- Preserve the raw PDAX status, direction, original description, and portfolio bucket balances.
- Do not treat portfolio balances, crypto quantities, or market values as transactions.
- Do not route PDAX portfolio/wallet screenshots through the GCrypto parser.
