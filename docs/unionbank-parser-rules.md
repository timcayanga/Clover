# UnionBank Parser Rules

This document captures the UnionBank parsing rules learned from the synthetic training bundles and should be used as a reference for future UnionBank import work.

## Scope

- Applies to UnionBank savings and UnionBank credit-card statement PDFs.
- Use institution-aware parser selection so savings and card statements do not get mixed.
- Preserve raw imports, normalized rows, and learned rules separately.

## Savings Statement Rules

- Use running balance as a required field.
- Only accept rows that belong to the transaction table. Ignore customer-service text, page footers, statement boilerplate, and other prose even if they contain numbers.
- Parse the table by row shape: date, reference, description, amount, balance.
- UnionBank often keeps the transaction amount and running balance on the same extracted line, so parse the full row block rather than expecting separate amount and balance rows.
- Keep `Bills Payment` rows as `Transfers`.
- Keep `Interest Earned` as `Income`.
- Keep `Withholding Tax` as `Financial`.
- Keep `Transfer to GCash`, `Transfer to PDAX`, `Transfer to Maya`, and `Xendit Transfer` as transfer-like movement rows.
- Keep `Online Fund Transfer` as `Transfers`.
- Treat `Incoming Credit` with `Not Applicable` or similarly vague descriptions as ambiguous and review them.
- For UnionBank, never let footer prose or page labels become transactions just because they contain dates or amounts.

## Credit Card Rules

- Detect credit-card statements from the header wording and keep them as `credit_card` accounts, even when the account number still looks like a long UnionBank identifier.
- Treat month-name date rows like `August 01, 2024` the same way as `MM/DD/YY` rows.
- Ignore header rows such as `Transactions DATE DESCRIPTION AMOUNT`; they are table labels, not real transactions.
- Keep `Cash Payment` as a card-payment credit, not income.
- Keep merchant rows such as `Grab`, `Starbucks`, `Lazada`, `Airbnb`, `Klook`, `Qantas`, `Cebu Pacific`, `Din Tai Fung`, `Petron`, and `Apple` as learned merchant/category candidates.
- Keep `OpenAI ChatGPT Subscription` as `Business` for this user.
- Preserve merchant text even when the statement wraps or truncates it.

## Review Gating

- Review rows with ambiguous credit descriptions.
- Review rows whose raw description is `Not Applicable`.
- Do not auto-accept generic credits without a readable source description.

## Expected Outcome

- UnionBank savings should import as a ledger with clear transfer and income separation.
- UnionBank credit cards should import as a merchant stream with reliable card-payment handling.
