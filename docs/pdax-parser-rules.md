# PDAX Screenshot Parser Rules

## Scope

These rules cover PDAX portfolio, fiat wallet history, and `Others` rewards screenshots. PDAX is distinct from GCrypto even though both can use PDAX infrastructure.

## Deterministic Rules

- Parse visible crypto holdings as separate investment snapshot markers with symbol, PHP market value, and quantity (for example, `BTC` and `XRP`); store PDAX as their institution rather than prefixing the asset name.
- Create `Wallet` as a PDAX wallet account from the visible PHP balance.
- Create `Gold` with the `Real-world asset` investment subtype from a visible Gold balance when no more-specific gold holding row is shown.
- When detailed crypto rows reconcile to the visible Crypto bucket, do not create an additional aggregate Crypto account.
- Skip cropped holdings when a complete asset name, market value, or quantity is not visible.
- A cropped PDAX portfolio showing `Portfolio`, `Cash in`, `Cash out`, `Deposit`, `Send`, and a PHP bucket is still PDAX. Treat those four labels as UI controls, never as an account or asset name.
- Parse Fiat `Cash In` and `Cash Out` entries as PHP income/expense transfers, preserving the provider description and status.
- Parse `Successful`, `Pending`, and `Failed` statuses into raw evidence; pending and failed entries remain review-required.
- Parse `Others` entries such as `PDAX Employee De Minimis` and `Rewards` as PHP income.
- Deduplicate overlapping wallet-history screenshots using date, time, direction, description, amount, and PDAX screenshot source.

## Data Integrity

- Preserve the raw PDAX status, direction, original description, and portfolio bucket balances.
- Do not treat portfolio balances, crypto quantities, or market values as transactions.
- Do not route PDAX portfolio/wallet screenshots through the GCrypto parser.
