# ATRAM Parser Rules

This document captures the current Clover parsing rules for ATRAM-backed investment imports, including GFunds transaction-history screenshots.

## Scope

- Applies to ATRAM mutual-fund imports and GFunds mobile screenshots that show ATRAM fund transaction history.
- Treat these imports as `investment` accounts, not bank or wallet accounts.
- Keep raw screenshot evidence separate from normalized investment transactions.

## GFunds Screenshot Rules

- Blue `Transaction History` screenshots from the GFunds flow should route to the Investments area.
- Use one investment account per visible fund, not one account per screenshot file.
- Never let screenshot file names like `IMG_1415.PNG` appear as account names.
- Visible fund names from the current training bundle include:
  - `ATRAM Philippine Equity Smart Index Fund`
  - `Philippine Stock Index Fund (Units)`
  - `ATRAM Global Technology Feeder Fund`
  - `ATRAM Peso Money Market Fund`
  - `ATRAM Medium Term Peso Bond Fund`
  - `ATRAM Global Consumer Trends Feeder Fund`
- Use the visible fund name as the investment account name.
- Use `ATRAM` as the institution for the current screenshot bundle so Clover can reuse the ATRAM investment branding.
- Parse only fully visible rows. If the bottom sheet or the screenshot edge cuts off the status, date, or amount, skip that row instead of inventing it.

## Transaction Mapping

- `Buy Order Completed` means money moved into the investment:
  - transaction type: `expense`
  - category: `Investments`
- `Sell Order Completed` means money moved out of the investment:
  - transaction type: `income`
  - category: `Investments`
- Preserve the visible signed amount text in the raw payload.
- Preserve the visible order status in the raw payload.
- Preserve the visible fund name in the raw payload even when the normalized transaction title is simplified.

## Date Rules

- Use the visible full date when present, for example `April 23, 2025`.
- Do not infer missing years for this bundle because the visible rows already include full years.

## Review Gating

- If Clover cannot recover all of `fund name + order status + date + amount`, do not create the row.
- If multiple screenshots overlap, dedupe rows by `fund name + order status + date + signed amount`.

## Expected Outcome

- The current GFunds screenshot bundle should surface 6 investment accounts.
- The current visible rows in the bundle should surface 20 investment transactions.
- These imports should appear under Investments rather than Banks, Wallets, or Cash.
