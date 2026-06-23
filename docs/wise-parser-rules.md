# Wise Parser Rules

This document captures Wise parsing rules learned from mobile transaction-history screenshots and should be used as the reference for future Wise import work.

## Scope

- Applies to Wise mobile transaction-history screenshots and any future Wise exports.
- Treat Wise as a multi-currency wallet, not a conventional bank statement.
- Wise screenshots may not show an account number, statement period, opening balance, or ending balance.
- A missing account number is acceptable when visible transaction rows can be extracted.
- Wise users may have multiple currency wallets (for example PHP, GBP, USD, CAD) with different underlying account numbers.
- Screenshots usually do not expose those account numbers, so Clover should infer distinct Wise wallet accounts by account-impact currency.
- Account display should be the plain brand label `Wise` because screenshots do not show account numbers or wallet labels.
- Use the inferred account-impact currency as hidden account identity, not as part of the visible account name.
- Do not add a synthetic account number or filename suffix when no account number is visible.

## Screenshot Recognition

- Wise mobile history screens commonly show controls such as `Search`, `Includes hidden`, `Type`, `Currency`, and `Direction`.
- Rows are grouped by date headers such as `Apr 13, 2026`.
- Rows can include a merchant/payee, an optional status such as `Added`, `Refunded`, `Sent`, or `Card checked`, then a visible amount.
- Multi-currency rows may show a bold/larger merchant-currency amount first and a smaller account-currency amount below it.

## Transaction Rules

- If a row has one amount, use that amount/currency as the Clover transaction amount because it is one of the user's Wise account currencies.
- If a row has two amounts, use the second/lower smaller-font amount/currency as the Clover transaction amount because it is the actual amount spent from the user's Wise account. This means `20.95 AUD` / `804.31 PHP` should import as `804.31 PHP`, even though PHP is numerically larger.
- Preserve the bold/larger first merchant-currency amount in raw payload/notes when it appears above the account-currency amount.
- Use the transaction/account-impact currency to choose the underlying Wise wallet account. One-amount `43.54 GBP` rows belong to the inferred GBP Wise wallet; two-amount `13,920 HKD` / `107,920.33 PHP` rows belong to the inferred PHP Wise wallet.
- Do not create a new Wise wallet account from a merchant-currency-only outgoing spend row when the account-impact amount is missing or cut off. For example, an isolated `11.50 AUD` spend line without the smaller PHP account amount should be skipped/review-only rather than creating an AUD Wise wallet.
- Rows with `+`, `Received`, or `Refunded` are incoming/refund movements.
- `Added` alone does not imply money came into the account. If there is no visible `+`, treat the row as outgoing spend unless the status or merchant clearly indicates a transfer.
- `To PHP Added` and similar wallet funding/conversion rows are `Transfers`.
- `Card checked` / zero-amount verification rows should be excluded or routed to review; they should not become confirmed spending.
- Rows without a visible/parseable date should not become visible Clover transactions with today's date. Keep them in parsed/audit data or exclude them until a date can be established.
- If a structured vision fallback extracts a Wise row with `date: null` but its parser evidence/source line begins with a visible Wise date header, recover that date before confirmation.
- Do not recover dates from evidence that only says a row was shown above or near a date header; scroll-continuation rows without their own visible date should remain audit-only/review-only unless another uploaded screenshot clearly supplies the date.
- Preserve visibly repeated identical Wise rows as separate transactions. Only deduplicate OCR duplicates when they come from the same visible source line.
- When multiple Wise screenshots are uploaded from the same scroll sequence, deduplicate overlap rows across the same or adjacent `IMG_*` files by wallet account, date, merchant, amount, and currency.
- Do not use the cross-screenshot overlap rule for non-adjacent files or for non-Wise institutions.

## Categorization

- Use merchant normalization before broad category fallback.
- Use contextual cues from merchant-spend currency and travel/location terms when available. For example, `Transport for NSW`, `SkyBus`, parking, rail, and airport merchants should bias toward `Transport`; souvenir and landmark/travel merchants should bias toward `Travel & Lifestyle`; venue/ticket landmarks such as `Sydney Opera House` should bias toward `Entertainment`.
- If the merchant text looks like a person or transfer counterparty rather than a business name, prefer `Transfers`.
- If a Wise row status is `Withdrawn`, prefer `Cash & ATM` even when the merchant text is partially noisy.
- For unseen screenshot merchants with readable text, prefer contextual keyword guesses over leaving the row as `Other`.
- Restaurants, cafes, groceries, parking, transport, education, subscriptions, and shopping should use the shared category rules.
- Refunds should be `Income` or transfer-like refund movement depending on the source row.
- Currency conversion and wallet funding rows should be `Transfers`.

## Review Gating

- Review rows where only partial merchant text is visible.
- Review rows where the sign, status, or amount direction is ambiguous.
- Review zero-amount verification rows if they are retained.
- Do not block the whole import just because Wise does not show an account number.

## Expected Outcome

- Uploading Wise screenshots should create or reuse separate wallet accounts internally by account-impact currency, while displaying each account as `Wise` with no account number unless one is visible in the source.
- Transactions should appear in Clover with their original currencies preserved.
- Once screenshot transactions are visible in the UI, later background reconciliation should not temporarily hide or shrink those visible rows while the remaining files finish processing.
- The import modal should complete once visible rows are saved, even without account number or balance metadata.
- If the first Wise screenshot OCR/transcription pass returns no rows or times out, Clover should still run one bounded structured vision fallback before returning `I-104`.
- Wise mobile screenshots should prefer a direct structured vision parse over multi-pass OCR. Target visible UI timing is 3-8 seconds for one clear screenshot, 10-25 seconds for five screenshots, and 20-45 seconds for ten screenshots.
