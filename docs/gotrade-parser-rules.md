# GoTrade Parser Rules

This document captures the deterministic rules for GoTrade investment screenshots.

## Screen Types

- `My positions` screens are investment account snapshots, not transactions.
- `Trade history` and `Recent trades` screens are investment activity statements.
- `Dividends` screens contain both cash-dividend income and withholding-tax expenses.
- Overlapping screenshots are expected. Preserve visible evidence and deduplicate repeated activity by security, action, amount, quantity, and execution details.

## Identity And Currency

- Use `GoTrade` as the institution and USD as the screenshot currency.
- Use the security as the investment account name when the screen identifies a holding, for example `Amazon`, `Verizon`, or `Vanguard S&P 500 ETF`.
- Preserve the ticker in `investmentSymbol` and fractional shares in `investmentQuantity`.
- Do not create a principal or maturity value for market securities when the screenshot only shows market value.

## Positions

- Use the visible market value as the investment account balance.
- Emit one account snapshot marker per visible holding.
- Do not treat percentage gain/loss or cash-earnings cards as balances or transactions.
- If a holding is cropped before its name or market value is visible, omit that incomplete holding rather than guessing it.

## Trades

- `Buy - Market by Dollars` is an expense in `Investments`.
- `Sell - Market by Dollars` is income in `Investments`.
- Preserve ticker, fractional share quantity, execution price, and gross trade amount in raw payload evidence.
- Do not turn the brokerage trade into a transfer unless the screen explicitly shows a cash movement.

## Dividends

- Cash dividend rows are income in `Income` and preserve per-share rate and share quantity.
- `Withholding tax 25% (PHL)` rows are expenses in `Financial` and preserve the 25% tax indicator.
- Keep gross dividend and tax withholding as separate transactions.

## OCR And Review

- Support icon noise, OCR substitutions, day-first and month-first dates, and values printed on the line before or after the share quantity.
- Prefer symbol/name catalog matches, but do not use screenshot filenames as identity.
- Never fabricate a missing position, transaction amount, quantity, or price. Unrecognized or incomplete rows should remain reviewable through the generic screenshot fallback.
