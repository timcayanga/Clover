# EastWest Parser Rules

This document captures the current EastWest parsing guidance for Clover.

## Scope

- Applies to EastWest Bank statement PDFs.
- Preserve raw statement rows and normalized transactions separately.
- Prefer deterministic parsing from the statement table before any fallback OCR path.

## Statement Shape

- The statement uses a table with `Book Date`, `Reference`, `Description`, `Value Date`, `Cheque No.`, `Debit`, `Credit`, and `Closing Balance`.
- Use `Closing Balance` as the running balance anchor when present.
- Prefer one transaction per table row, even when descriptions are noisy or wrapped.

## Transaction Rules

- `Cash Deposit` should normalize as income.
- `Transfer SUCCESSFUL` should normalize as a transfer.
- `Outward Cheque / Cheque Enlistment` should normalize as an expense.
- `Outward Cheque Dr / Cheque Enlistment` should normalize as an expense.

## Parsing Guidance

- Treat EastWest as a statement-table parser first, not a generic ledger fallback.
- Keep the account holder and account number from the statement header when available.
- Preserve the original reference and description text in raw payloads for traceability.

## Review

- Rows with ambiguous debit/credit attribution should go to review rather than being auto-corrected.

