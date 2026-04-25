# PNB Parser Rules

This document captures the PNB parsing rules learned from the synthetic training bundle and should be used as a reference for future PNB import work.

## Scope

- Applies to Philippine National Bank savings and Mastercard statement PDFs.
- Treat deposit-account and credit-card statements as different statement shapes.
- Preserve raw imports, normalized rows, and learned rules separately.

## Savings Statement Rules

- Use running balance as a first-class field.
- Keep salary credits as `Income`.
- Keep `Interest Earned` as `Income`.
- Keep `Fund Transfer` rows as `Transfers`, including sends to GCash and Maya and incoming transfers from Maya.
- Keep `ATM Withdrawal` as `Transfers`.
- Keep `Transfer Fee` and `ATM Fee` as `Financial`.
- Keep `Bills Payment Meralco` as `Bills & Utilities`.
- Keep `Adjustment Reversal` as a transfer-like correction row.
- Keep `Month-End Sweep to Investment Account` as a transfer-like sweep and review it before auto-confirming.
- Keep `Transfer to BPI Savings 6612` as `Other` unless a stronger bank-to-bank transfer rule is learned later.
- Keep `Withholding Tax` as `Financial`.

## Credit Card Rules

- Keep `Cash Payment` as a card-payment credit, not income.
- Keep merchant rows intact when they have valid dates and amounts.
- Keep `Grab` and `Petron` as `Transport`.
- Keep `OpenAI ChatGPT Subscription` as `Business`.
- Keep `Lazada` as `Shopping`, including refund-style rows when the statement clearly marks a refund.
- Keep `Airbnb`, `Cebu Pacific`, `Klook`, and `Qantas` as `Travel & Lifestyle`.
- Keep `Din Tai Fung` as `Food & Dining`.
- Keep `Apple` as `Other` for now.

## Learning Notes

- Treat repeated merchant/category pairings as durable learned rules, not one-off guesses.
- Preserve the raw merchant text for traceability even when the normalized name is shortened.
- Prefer deterministic mappings before any AI fallback.

## Review Gating

- Review internal sweep rows that move money into investments.
- Review rows that look like statement housekeeping or account maintenance when the intent is not obvious.
- Do not silently reclassify transfer-like rows as spend.

## Expected Outcome

- PNB savings should import as a clean running-balance ledger with transfers, fees, and taxes preserved.
- PNB Mastercard should import as a merchant stream with payment handling and learned category mappings preserved.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
