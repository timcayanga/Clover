## GCrypto Parser Rules

This document captures Clover's current parsing rules for GCrypto mobile screenshots and similar crypto-investment screenshots.

## Scope

- Applies to GCrypto mobile transaction-history screenshots.
- Informs shared screenshot handling for similar crypto or investment screenshots that show dated activity rows.

## Account Identity

- Use `GCrypto` as the institution when the screenshot clearly comes from the GCrypto flow.
- Use `GCrypto` as the canonical account name for current GCrypto screenshots instead of filename-derived labels.
- Route GCrypto screenshots to the Investments area with `accountType = investment`.
- Do not invent account numbers when the screenshot does not display one.

## Transaction History Screens

- Treat GCrypto transaction-history screenshots as statement-like activity screens even when they do not show a formal account number or ending balance.
- Preserve visible asset names, quantities, order IDs, status labels, provider hints such as `PDAX`, and wallet or trading-wallet references in raw payload or parser evidence.
- Keep rows in visible source order.
- Deduplicate overlapping visible rows across stitched or repeated screenshots.

## Movement And Categories

- `Buy` rows map to `type = expense` and category `Investments`.
- `Sell` rows map to `type = income` and category `Investments`.
- `Withdraw - Trading Wallet` and other clearly internal wallet-withdrawal rows map to Transfers rather than spending.
- Internal wallet funding, settlement transfers, and wallet-to-wallet movement should stay in Transfers unless the screenshot clearly shows external spending or income.

## OCR Recovery

- Prefer deterministic parsing before AI fallback.
- Support noisy OCR where status, date, amount, and asset details may collapse onto one or two lines.
- Ignore filename fragments, mobile chrome, page furniture, and screenshot UI artifacts when extracting transaction rows.
- When OCR is partial, return only the visible supported rows instead of padding the list.

## Shared Investment Screenshot Guidance

- Similar crypto, fund, and investment transaction-history screenshots should be treated as `investment_history` documents in the shared fallback parser.
- Preserve asset identity and transaction evidence instead of collapsing rows into generic labels.
- Do not invent balances or holdings when a screenshot only shows activity rows.
