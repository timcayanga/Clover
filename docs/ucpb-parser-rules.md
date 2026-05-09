# UCPB Parser Rules

This document captures the current UCPB parsing guidance for Clover.

## Scope

- Applies to UCPB statement PDFs.
- Preserve raw statement data and normalized transactions separately.
- Prefer deterministic parsing before OCR fallback.

## Statement Shape

- UCPB statements in the sample set use transaction codes with a running balance.
- Common codes:
  - `CSD` for cash deposit
  - `ICC` for withdrawal
  - `DM` for debit memo
  - `SC` for service charge

## Transaction Rules

- `Cash Deposit (CSD)` should normalize as income.
- `Withdrawal (ICC)` should normalize as cash/ATM spending.
- `Debit Memo (DM)` should be treated as an expense or transfer-like outflow depending on row context.
- `Service Charge (SC)` should normalize as a financial fee.

## Parsing Guidance

- Keep the code label and the human-readable transaction label together in the raw payload.
- Use the running balance to validate row ordering and catch OCR duplication.

## Review

- Debit memos that do not clearly map to a transfer or fee should go to review.

