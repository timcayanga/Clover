# ATRAM Parser Rules

This document captures the current Clover parsing rules for ATRAM-backed investment imports, including GFunds transaction-history screenshots and portfolio-style holdings screens.

## Scope

- Applies to ATRAM mutual-fund imports and GFunds mobile screenshots that show ATRAM fund transaction history.
- Treat these imports as `investment` accounts, not bank or wallet accounts.
- Keep raw screenshot evidence separate from normalized investment transactions.

## GFunds Screenshot Rules

- Blue `Transaction History` screenshots from the GFunds flow should route to the Investments area.
- Portfolio or holdings screenshots that show ATRAM or GFunds fund balances should route to the Investments area as `portfolio` imports instead of generic statements.
- Use one investment account per visible fund, not one account per screenshot file.
- Never let screenshot file names like `IMG_1415.PNG` appear as account names.
- The parser should not depend only on `IMG_1415.PNG`-style names. If the screenshot is renamed, Clover should still recover the sample through OCR content or the known file fingerprint.
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
- Tolerate OCR that merges a fund name with its signed amount on the same line or a status with its date on the same line.

## Portfolio Snapshot Rules

- When a GFunds or ATRAM screen shows holdings metrics such as `Current Value`, `Market Value`, `Subscribed Amount`, `Invested Amount`, `Gain/Loss`, `Units`, or `NAVPU`, treat it as a portfolio snapshot.
- Persist the document family as `portfolio` so the import worker saves an investment snapshot and holdings instead of only creating parsed rows.
- Use `GFunds Investments` as the portfolio account label when the screenshot is portfolio-wide rather than tied to a single visible fund account card.
- Use `ATRAM` as the institution for current GFunds portfolio screens.
- For each visible fund holding:
  - `asset_type`: `mutual_fund`
  - `currency`: `PHP`
  - `status`: `active`
- Prefer visible `Current Value` or `Market Value` as the holding value.
- Use `Subscribed Amount` or `Invested Amount` as cost basis when present.
- Use the visible `Gain/Loss` amount directly when present; do not recompute it if the screenshot already provides it.
- Preserve the visible fund name, units, and NAVPU text in parser evidence or raw payload so the user can trace what Clover read.

## Fund Detail Rules

- When the screen focuses on one ATRAM fund and shows balance metrics such as `Current Value`, `Market Value`, `Subscribed Amount`, `Invested Amount`, `Gain/Loss`, `Units`, or `NAVPU`, treat it as an `account_detail` import.
- Use the visible fund name as the investment account name for single-fund detail screens.
- Still persist a holding row for the visible fund so Clover can show an investment position even without a multi-fund portfolio layout.
- Prefer visible `Current Value` or `Market Value` as the account balance.
- Use `Subscribed Amount` or `Invested Amount` as cost basis when present.
- Preserve the visible fund name, units, NAVPU, and gain/loss text in parser evidence or raw payload.

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
- Mark parsed rows as mobile screenshots so Clover's overlap collapse can remove duplicated rows from adjacent scroll captures before confirmation.

## Expected Outcome

- The current GFunds screenshot bundle should surface 6 investment accounts.
- The current visible rows in the bundle should surface 20 investment transactions.
- These imports should appear under Investments rather than Banks, Wallets, or Cash.
