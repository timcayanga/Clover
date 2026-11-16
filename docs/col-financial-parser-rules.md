# COL Financial portfolio screenshots

- A portfolio table with FMETF, GTCAP, SM, URC, or other listed assets is a holdings inventory when it shows position quantities and current values rather than dated purchases or sales.
- Identify COL Financial from explicit institution evidence in the image or validated document metadata, never from the stock symbols alone.
- Preserve each asset, symbol, stated quantity, currency, value, source evidence, and confidence. Do not invent cost basis, transaction dates, or cash movements from a portfolio valuation.
- A holdings-only portfolio must complete without ledger rows. Use the shared portfolio finalizer to create per-asset links and pending-review snapshots, preserving existing account values and the original source document.
- Missing provider/currency/value or ambiguous identities must yield an actionable review error; never silently default to an expense or report an invisible success.
- Retries must be idempotent and account limits apply across Profiles. A failure must roll back all account/snapshot links.
