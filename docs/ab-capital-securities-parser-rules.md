# AB Capital Securities Parser Rules

This document captures Clover's current parsing rules for AB Capital Securities / Investatrade screenshots surfaced through GStocks inside GCash.

## Scope

- Applies to GStocks mobile screenshots that show AB Capital / Investatrade stock holdings.
- Treat these imports as `investment` accounts, not bank, wallet, or cash accounts.
- Preserve `AB Capital Securities` or `Investatrade` as the provider in raw payloads when visible.

## Identity Rules

- Use `GStocks` as the Clover institution when the screenshot clearly comes from the GStocks flow inside GCash.
- Preserve `AB Capital Securities` as the broker/provider in raw payloads and parser evidence.
- Do not let screenshot filenames such as `IMG_1419.PNG` become account names.
- For individual holdings, use the visible stock identity instead of a generic portfolio label.

## Holdings Screenshot Rules

- Screens headed by `Home | AB Capital`, `powered by investatrade`, and `My Stocks` are holdings snapshots, not transaction history.
- The current training bundle is one scrolling portfolio captured across overlapping screenshots. Treat repeated rows as the same holdings, not separate accounts.
- Materialize one investment account per visible stock holding so Clover's current Investments page can display them directly.
- Use these fields when visible:
  - `investmentSubtype`: `stock`
  - `investmentSymbol`: visible stock ticker such as `AP`, `AREIT`, `CREIT`, `DMC`, `MER`, `MREIT`, `RCR`, `SCC`, `TEL`
  - `investmentQuantity`: visible `Shares`
  - `investmentCostBasis`: visible `Total Cost`
  - `balance`: visible `Market Value`
- Preserve visible `Avg Price`, `Last Price`, profit value, and profit percent in raw payloads even when Clover does not map all of them to first-class account fields yet.

## Review Gating

- Parse only holdings whose identity and balance metrics are visibly anchored on-screen.
- If a screenshot only shows portfolio chrome without a complete holding card, skip it instead of inventing values.
- If multiple screenshots overlap, update the same stock holding accounts instead of creating duplicates.

## Expected Outcome

- The current GStocks screenshot bundle should resolve to one `GStocks` investment position per visible stock holding.
- The imported holdings should appear on both the Accounts and Investments pages with current value, quantity, and purchase value available.
