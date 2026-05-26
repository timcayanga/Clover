# China Bank Parser Rules

This document captures the current China Bank parsing guidance for Clover.

## Scope

- Applies to China Bank statement PDFs.
- Preserve raw statement text and normalized transactions separately.
- Prefer deterministic parsing before any OCR or model fallback.

## Statement Shape

- China Bank statements in the sample set use a statement-period summary box plus a transaction table.
- The summary box usually includes beginning balance, total debit, total credit, and ending balance.
- Transaction rows can be fragmented across OCR lines, especially on image-heavy PDFs.
- A single PDF can contain multiple monthly statement periods. Parse each period and combine the rows under the same account when the account number matches.
- Preserve formatted account numbers such as `1407-00-00679-0`; do not collapse them to the downloaded filename or statement date.

## Parsing Guidance

- Trust the transaction table over footer text, page markers, or repeated summary blocks.
- Trust explicit Debit, Credit, and Balance columns before deriving amounts from the running balance.
- Repair common OCR money splits before parsing, including `1,245 645.28`, `50.000.00`, and `1,552.467.16`.
- Keep check numbers, references, and reversal markers in raw payloads when present.
- Preserve long account-holder names when they wrap across lines.
- Treat housekeeping, reversal, and memo rows separately from ordinary debit and credit activity.
- The known transaction labels in the current sample are `Inclearing Check`, `Encashment`, `Cash Deposit`, `Interest`, `Withholding Tax`, and `Credit Memo`.
- `Inclearing Check` and `Withholding Tax` are expenses in the Financial category.
- `Cash Deposit`, `Interest`, and `Credit Memo` are income rows. `Credit Memo` belongs in Financial.
- `Encashment` follows the explicit debit/credit column: debit rows are Cash & ATM expenses, credit rows are Income.

## Review

- Rows with ambiguous debit versus credit direction should go to review instead of being auto-confirmed.
- If OCR output is too fragmented to reconstruct the running balance reliably, fall back to the OpenAI OCR path rather than inventing rows.
