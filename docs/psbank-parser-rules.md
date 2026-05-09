# PSBank Parser Rules

This document captures the current PSBank parsing guidance for Clover.

## Scope

- Applies to PSBank statement PDFs.
- Preserve raw statement payloads, parsed rows, and normalized transactions separately.
- Prefer deterministic parsing before any fallback OCR or AI extraction.

## Statement Shape

- The sample statement includes recurring balance-related rows such as `Interest Due` and `Penalty Due`.
- Preserve installment-style and loan-related rows instead of flattening them into generic spend.

## Transaction Rules

- `Interest Due` should be treated as a financial charge.
- `Penalty Due` should be treated as a financial charge.
- `Loan Availment-Deferred ATM 36 mos. (7/36)` should be treated as a transfer/loan movement, not a normal expense.

## Parsing Guidance

- Keep the original PSBank labels in raw payloads for traceability.
- Avoid auto-normalizing loan or penalty rows into merchant spend.

## Review

- Loan and penalty rows should be review-worthy when the statement context is incomplete.

