# Wise Parser Rules

This document captures Wise parsing rules learned from mobile transaction-history screenshots and should be used as the reference for future Wise import work.

## Scope

- Applies to Wise mobile transaction-history screenshots and any future Wise exports.
- Treat Wise as a multi-currency wallet, not a conventional bank statement.
- Wise screenshots may not show an account number, statement period, opening balance, or ending balance.
- A missing account number is acceptable when visible transaction rows can be extracted.
- Account display should be `Wise` unless a more specific visible wallet/account label is present.

## Screenshot Recognition

- Wise mobile history screens commonly show controls such as `Search`, `Includes hidden`, `Type`, `Currency`, and `Direction`.
- Rows are grouped by date headers such as `Apr 13, 2026`.
- Rows can include a merchant/payee, an optional status such as `Added`, `Refunded`, `Sent`, or `Card checked`, then a visible amount.
- Multi-currency rows may show the original transaction amount first and a PHP converted equivalent below it.

## Transaction Rules

- Preserve the original visible amount and currency as the transaction amount.
- Preserve the PHP converted equivalent in raw payload/notes when it appears below a foreign-currency amount.
- Do not replace foreign-currency amounts with the PHP converted equivalent.
- Rows with `+`, `Added`, `Received`, or `Refunded` are incoming/refund movements.
- Rows without `+` are outgoing spend unless the status or merchant clearly indicates a transfer.
- `To PHP Added` and similar wallet funding/conversion rows are `Transfers`.
- `Card checked` / zero-amount verification rows should be excluded or routed to review; they should not become confirmed spending.
- Deduplicate overlapping screenshot rows by date, merchant, amount, currency, and status.

## Categorization

- Use merchant normalization before broad category fallback.
- Restaurants, cafes, groceries, parking, transport, education, subscriptions, and shopping should use the shared category rules.
- Refunds should be `Income` or transfer-like refund movement depending on the source row.
- Currency conversion and wallet funding rows should be `Transfers`.

## Review Gating

- Review rows where only partial merchant text is visible.
- Review rows where the sign, status, or amount direction is ambiguous.
- Review zero-amount verification rows if they are retained.
- Do not block the whole import just because Wise does not show an account number.

## Expected Outcome

- Uploading Wise screenshots should create or reuse a `Wise` wallet account.
- Transactions should appear in Clover with their original currencies preserved.
- The import modal should complete once visible rows are saved, even without account number or balance metadata.
