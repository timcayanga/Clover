# RCBC Parser Rules

This document captures the RCBC credit-card parsing rules learned from the April 2026 Visa Platinum statement and should be used as a reference for future RCBC import work.

## Scope

- Applies to RCBC credit-card statement PDFs, especially `eStatement_VISA PLATINUM_*.pdf`.
- Also applies to RCBC savings / deposit statements that use `STATEMENT OF ACCOUNT` and `Account Type CAV01`.
- Treat the relevant account as `RCBC 1014` unless a newer statement explicitly proves otherwise.
- Preserve both raw and normalized data when importing.

## Accept Rules

- Emit a transaction only when the row has:
  - a real transaction date
  - a merchant or descriptor
  - a debit or credit amount
  - a row shape that matches the transaction table
- Preserve both sale date and post date when present.
- Preserve foreign-currency metadata when the statement includes it.
- Keep cash payments as card-payment credits, not income.
- For RCBC savings statements, keep the last 4 digits in the account name so multiple RCBC accounts do not merge, for example `RCBC 5080`.
- For RCBC cards, keep the last 4 digits in the account name, for example `RCBC 1014` or `RCBC 2006`.
- Keep travel, shopping, food, transport, business, and bill merchants as learned category candidates instead of collapsing them to `Other`.

## Reject Rules

- Do not import boilerplate as transactions.
- Reject phone numbers, email addresses, customer service text, legal notices, due-date disclaimers, and page markers.
- Reject statement footer text such as `PAGE 2 of` or `*** END OF STATEMENT - PAGE ***`.
- Reject balance-summary fragments and other isolated numeric text.
- Do not emit rows with `₱0.00` unless the row is clearly a valid transaction and the amount was extracted from elsewhere.

## Common Failure Modes

- OCR or text extraction can leak statement prose into the transaction table.
- Boilerplate rows often look like uppercase text blocks with no valid amount.
- Account numbers can be misread from footer text or page metadata.
- Merchant strings can be polluted by phone numbers or statement headers.

## RCBC Heuristics

- If the statement contains `STATEMENT OF ACCOUNT` and `Account Type CAV01`, treat it as a savings/deposit account rather than a credit card.
- If a row contains multiple phone numbers, treat it as boilerplate.
- If the extracted merchant is only a number, a date fragment, or a statement header phrase, reject it.
- If the parser cannot find a real amount, mark the row invalid instead of storing `0.00`.
- If the account number is inferred from footer text instead of the card identifier, override it with the correct last 4 digits.
- Rows like `Cash Payment`, `OpenAI ChatGPT Subscription`, `Grab`, `Lazada`, `Airbnb`, `Klook`, `Cebu Pacific`, `Din Tai Fung`, `Petron`, and `Apple` should use the learned merchant/category rules rather than defaulting to `Other`.
- RCBC retail and payment descriptors like `THE SM STORE-SM FAIRVIEW 03/03`, `SM STORE-SM GRAND CALOOCAN PH`, and `BAYAD ONLINE PASIG PH` should simplify to readable merchant names and categorize as `Shopping` or `Bills & Utilities` when the merchant is clear.
- If the merchant only looks like a location code or a vague descriptor such as `SEC PASAY PH`, keep it readable but conservative until a stronger merchant rule is learned.

## Review Gating

- Ambiguous but transaction-like rows should go to review.
- Rows with invalid dates, invalid amounts, or obvious boilerplate should be dropped.
- If a row falls into `Other` because the merchant is unclear, that should trigger a parser review check.

## Expected Outcome

- The transactions page should only show real line items.
- The account should normalize to the correct RCBC identity with last 4 digits `1014`.
- No statement boilerplate should survive into the transaction list.
