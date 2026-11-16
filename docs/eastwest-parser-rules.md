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

- `Cash Deposit` should remain a positive/income amount, but its category should be `Cash & ATM`.
- `Transfer SUCCESSFUL` should normalize as a transfer.
- `Outward Cheque / Cheque Enlistment` should normalize as an expense.
- `Outward Cheque Dr / Cheque Enlistment` should normalize as an expense.

## Parsing Guidance

- Treat EastWest as a statement-table parser first, not a generic ledger fallback.
- Keep the account holder and account number from the statement header when available.
- Preserve the original reference and description text in raw payloads for traceability.
- OCR/image-based EastWest templates may misread dates, amounts, and labels (`Account Staberment`, `Cash Diepoait`, `Transles`, `SUCCESSFLL`, `Dufveard Cheques`); normalize these only inside the EastWest parser and keep the raw OCR text or reference evidence in raw payloads.
- Public/sample EastWest templates with `JOHN CITIZEN`, statement date `25 February 2022`, and the standard 15-row table should parse deterministically to the known table rows rather than completing with zero transactions.

## Review

- Rows with ambiguous debit/credit attribution should go to review rather than being auto-corrected.

## Release regression protection

- The retained Excel/PDF and Word/PDF templates are distinct source variants. The former has a blank account field; the latter prints an account. Never copy an identity from a known template into a blank header.
- Empty PDF layers must reach local OCR. Preserve table rows and read small header identifiers from a lossless crop, retaining the extracted source text.
- Retain the learned 15-row template suggestions, but cap them at 45 confidence for review: the published variants contain inconsistent directions and running balances. Keep old balance hints under `templateBalanceHint`, never as an observed `balance` or part of a purported source description. Confirmed existing records remain unchanged.

## InstaPay mobile transfer proofs

- A successful EastWest proof explicitly separates From (masked sender) and To (recipient, recipient bank and recipient account). Use EastWest as the source institution; never create a user-owned recipient account solely because it appears on the proof.
- Require the exact success heading, EastWest brand, sender role, masked account suffix, printed PHP principal, explicit PHP fee, InstaPay mode, valid complete date/time and reference. Pending/failed screens are not successful proof.
- Keep principal and nonzero fee as separate outgoing components, each linked to the reference and source timestamp. Zero fee produces no invented extra expense. Do not manufacture hidden account digits, balances, or a matching incoming transfer.
- Masked sender matching remains review-required. Preserve source text, recipient roles, component amounts and user-confirmed existing account identity/balance.
