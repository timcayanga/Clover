# Wise Parser Rules

This document captures Wise parsing rules learned from mobile transaction-history screenshots and should be used as the reference for future Wise import work.

## Scope

- Applies to Wise mobile transaction-history screenshots and any future Wise exports.
- Treat Wise as a multi-currency wallet, not a conventional bank statement.
- Wise screenshots may not show an account number, statement period, opening balance, or ending balance.
- A missing account number is acceptable when visible transaction rows can be extracted.
- Wise users may have multiple currency wallets (for example PHP, GBP, USD, CAD) with different underlying account numbers.
- Screenshots usually do not expose those account numbers, so Clover should infer distinct Wise wallet accounts by account-impact currency.
- Account display should be `Wise <CURRENCY>` when the wallet currency can be inferred, such as `Wise PHP` or `Wise GBP`.
- Do not collapse inferred wallet display names back to the generic `Wise` brand label when no account number is present.
- Existing generic Wise upload accounts may be displayed as `Wise <CURRENCY>` from their account currency when the stored name is only `Wise`.

## Screenshot Recognition

- Wise mobile history screens commonly show controls such as `Search`, `Includes hidden`, `Type`, `Currency`, and `Direction`.
- Rows are grouped by date headers such as `Apr 13, 2026`.
- Rows can include a merchant/payee, an optional status such as `Added`, `Refunded`, `Sent`, or `Card checked`, then a visible amount.
- Multi-currency rows may show a bold/larger merchant-currency amount first and a smaller account-currency amount below it.

## Transaction Rules

- If a row has one amount, use that amount/currency as the Clover transaction amount because it is one of the user's Wise account currencies.
- If a row has two amounts, use the smaller second amount/currency as the Clover transaction amount because it is the actual amount spent from the user's Wise account.
- Preserve the bold/larger first merchant-currency amount in raw payload/notes when it appears above the account-currency amount.
- Use the transaction/account-impact currency to choose the Wise wallet account. One-amount `43.54 GBP` rows belong to `Wise GBP`; two-amount `13,920 HKD` / `107,920.33 PHP` rows belong to `Wise PHP`.
- Do not create a new Wise wallet account from a merchant-currency-only outgoing spend row when the account-impact amount is missing or cut off. For example, an isolated `11.50 AUD` spend line without the smaller PHP account amount should be skipped/review-only rather than creating `Wise AUD`.
- Rows with `+`, `Added`, `Received`, or `Refunded` are incoming/refund movements.
- Rows without `+` are outgoing spend unless the status or merchant clearly indicates a transfer.
- `To PHP Added` and similar wallet funding/conversion rows are `Transfers`.
- `Card checked` / zero-amount verification rows should be excluded or routed to review; they should not become confirmed spending.
- Rows without a visible/parseable date should not become visible Clover transactions with today's date. Keep them in parsed/audit data or exclude them until a date can be established.
- If a structured vision fallback extracts a Wise row with `date: null` but its parser evidence/source line begins with a visible Wise date header, recover that date before confirmation.
- Do not recover dates from evidence that only says a row was shown above or near a date header; scroll-continuation rows without their own visible date should remain audit-only/review-only unless another uploaded screenshot clearly supplies the date.
- Preserve visibly repeated identical Wise rows as separate transactions. Only deduplicate OCR duplicates when they come from the same visible source line.

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

- Uploading Wise screenshots should create or reuse separate wallet accounts such as `Wise PHP`, `Wise GBP`, `Wise USD`, and `Wise CAD` when those account-impact currencies appear.
- Transactions should appear in Clover with their original currencies preserved.
- The import modal should complete once visible rows are saved, even without account number or balance metadata.
- If the first Wise screenshot OCR/transcription pass returns no rows or times out, Clover should still run one bounded structured vision fallback before returning `I-104`.
