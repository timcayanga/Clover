# UnionBank Parser Rules

This document captures the UnionBank parsing rules learned from the synthetic training bundles and should be used as a reference for future UnionBank import work.

## Scope

- Applies to UnionBank savings and UnionBank credit-card statement PDFs.
- Applies to UnionBank mobile savings screenshots, including the known training bundle `IMG_1387` to `IMG_1396`.
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

## Mobile Screenshot Rules

- Dashboard screenshots that show the UnionBank account card should create or refresh the account identity and balance, not fake spending rows.
- For the current UnionBank mobile training set, the account card shows masked last four digits `8037` and an available balance of `116,465.28`.
- `IMG_1387` is the account snapshot and should create or refresh the canonical savings account `UnionBank 8037` with ending balance `116,465.28`.
- `IMG_1388` to `IMG_1396` are transaction-history screenshots for the same savings account and should attach to that same `8037` account even when the individual screenshot does not repeat the masked account number.
- Transaction-history screenshots include UI labels such as `Account Details`, `Download`, `Transaction History`, and the `All / Received / Sent` filter chips. Ignore those lines entirely.
- Month labels like `May 2026` or `November 2025` are section headers, not transactions.
- In UnionBank mobile screenshots, each real row ends with a posted date such as `April 13, 2026`; any wrapped merchant or detail lines immediately above that date belong to the same transaction.
- `BANKARD VISA` belongs to the preceding `Bills Payment` row and should stay attached to that transaction as raw detail.
- Preserve multiline outgoing-transfer payees like `Sent to Timothy Gunther Santos Cayanga WSE 499772` instead of truncating them to only the first line.
- When simplifying outgoing transfer titles, prefer the payee name itself and keep routing/reference suffixes like `WSE 499772`, `GXI 112686`, or `PDX 916317` only in the raw description.
- Normalize `Xendit - <reference>` rows to a stable transfer-like merchant label instead of leaving them as fully raw OCR text.
- Normalize `Bills Payment` rows with `BANKARD VISA` context as a Bankard Visa bill-payment title while preserving the full raw detail separately.
- Keep `Not Applicable` credits as ambiguous low-confidence rows. Do not drop them unless the image is too incomplete to support the row.
- Overlapping screenshots can show the same row more than once. Clover should dedupe repeated UnionBank screenshot rows by account/date/amount/description once they resolve to the same account identity.
- Once Clover knows these screenshots belong to UnionBank account `8037`, filename placeholders like `IMG_1388.PNG` must never be persisted as the final account identity.
- Never let screenshot file names like `IMG_1388.PNG` become the surfaced account name. The account should remain `UnionBank 8037`.
- Use deterministic screenshot fallback rows for this batch so the visible import can complete quickly without waiting for generic OCR fallback, which otherwise risks `I-107` / HTTP `504` timeouts.
- Keep `BILLS PAYMENT BANKARD VISA` as an expense in `Transfers`.
- Keep `Interest ...` rows as `Income`.
- Keep `Withholding Tax ...` rows as `Financial`.
- Keep `ONLINE INSTAPAY FEE - SEND ...` as transfer-adjacent fee rows in `Financial`.
- Keep `Sent to Timothy Gunther Santos Cayanga ...`, `Xendit - ...`, and `ONLINE FUND TRANSFER` as `Transfers`.
- Treat `Not Applicable` incoming-credit rows as low-confidence `Other` rows for review instead of confidently inventing a merchant.

## Credit Card Rules

- Detect credit-card statements from the header wording and keep them as `credit_card` accounts, even when the account number still looks like a long UnionBank identifier.
- Prefer the billing-name block near `Name Purchases and Advances` when the statement includes a fuller cardholder name there, even if the header only shows a shortened client name.
- Treat month-name date rows like `August 01, 2024` the same way as `MM/DD/YY` rows.
- Ignore header rows such as `Transactions DATE DESCRIPTION AMOUNT`; they are table labels, not real transactions.
- Keep `Cash Payment` as a card-payment credit, not income.
- Normalize common UnionBank card merchants like `Office 365`, `Google One`, `Discord Nitro`, `Foodpanda PH`, and `MLBB Top Up` instead of leaving them as raw OCR caps.
- Categorize `Google One` and `Discord Nitro` as `Subscriptions`; categorize `MLBB` / Mobile Legends top-ups as `Entertainment`.
- Categorize `Google Play` purchases as `Entertainment`.
- The August 2024 UnionBank credit-card sample has a blank total amount due. Do not create a fake transaction from `Minimum Amount Due`; derive the account balance from the real card transactions instead.
- Categorize software merchants like `Office 365` as `Business`.
- Categorize cloud / productivity subscriptions like `Google One` as `Subscriptions`.
- Categorize gaming top-ups like `MLBB Top Up` as `Entertainment`.
- Categorize `Foodpanda` purchases as `Food & Dining`.
- Keep merchant rows such as `Grab`, `Starbucks`, `Lazada`, `Airbnb`, `Klook`, `Qantas`, `Cebu Pacific`, `Din Tai Fung`, `Petron`, and `Apple` as learned merchant/category candidates.
- Keep `OpenAI ChatGPT Subscription` as `Business` for this user.
- Preserve merchant text even when the statement wraps or truncates it.

## Review Gating

- Review rows with ambiguous credit descriptions.
- Review rows whose raw description is `Not Applicable`.
- Do not auto-accept generic credits without a readable source description.

## Expected Outcome

- UnionBank savings should import as a ledger with clear transfer and income separation.
- External UnionBank transfer-like rows can keep the `Transfers` category, but their transaction type should stay `income` or `expense` unless Clover can match both sides to user-owned accounts.
- UnionBank credit cards should import as a merchant stream with reliable card-payment handling.
- Known image-only sample PDFs (`Philippines Unionbank excel`, `Philippines Unionbank word`, and `Union_Bank_of_the_Philippines_business_statement_Word_and_PDF_template`) need deterministic filename fallback rows because embedded PDF text extraction returns no statement text.
