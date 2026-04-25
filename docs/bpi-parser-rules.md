# BPI Parser Rules

## Scope

Use these rules for BPI savings and related statement imports.

## Core Patterns

- `Tax Withheld` and `TAXWITHHELD` map to `Financial`.
- `InstaPay Transfer Fee` and compact variants like `InstaPayTransferFeeTRANSFERTOOTHERBANK` map to `Transfers`.
- `InstaPay Transfer` and `Fund Transfer` map to `Transfers`.
- `Interest Earned` maps to `Income`.
- `Bills Payment` maps to `Bills & Utilities`.
- BPI credit card statements should infer the visible account suffix from the customer/account number on the statement and resolve to `BPI <last4>` rather than falling back to a generic account.
- `BPI Signature` and other BPI card statements should be treated as `credit_card`, not bank savings, even when the OCR text is compacted, but the visible account name should stay bank-simple as `BPI <last4>`.
- The parsed suffix may vary by statement, for example `9001`, `8556`, or `8705`, depending on the card's customer number.

## Parsing Guidance

- Prefer deterministic parsing from the line item text before any fallback.
- Compact BPI labels often remove spaces, so parser checks should handle normalized and compact forms.
- Fee rows that are clearly transfer-related should stay in the transfer flow instead of falling back to generic expense handling.
- BPI OCR can merge adjacent month, day, and merchant tokens; parsing should decompact those tokens before extracting the date and merchant text.
- BPI Signature credit-card rows are two-date ledger lines: sale date, post date, merchant, amount.
- For BPI Signature credit-card rows, normalize the transaction date to the post date.
- Use the PHP equivalent as the primary amount when a foreign-currency line shows both the source currency and the PHP conversion.
- Keep the original source-currency amount in notes or raw payload metadata instead of making it a second transaction row.
- Treat `Payment - Thank You` as a card payment / transfer-style credit, not an expense.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable BPI simplifications such as `Payroll Credit`, `GCash Cash In`, `ATM Withdrawal`, `Merchant Payment`, and `Bank Transfer`.

## Notes Handling

- Do not write raw parser JSON into transaction notes.
- Keep transaction notes human-readable and concise.
- If there is no human-readable note, leave notes empty instead of storing the raw import payload.

## Review

- Unexpected `Other` categories for BPI should be treated as a parser bug when the line item clearly matches one of the learned patterns above.
