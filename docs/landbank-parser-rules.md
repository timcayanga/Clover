# Landbank Parser Rules

This document captures the current LandBank parsing guidance for Clover.

## Scope

- Applies to Land Bank of the Philippines statement PDFs.
- Keep raw and normalized data separate.
- Prefer deterministic parsing before any AI fallback.

## Statement Shape

- LandBank statements in the sample set behave like a running-balance ledger.
- Use statement dates and balance movements to infer transaction direction when possible.
- Preserve the statement account number and account holder exactly as printed.

## Transaction Rules

- `TRANSFER (Internet Banking)` and other transfer-like ledger rows should keep transfer semantics until Clover can resolve whether they are internal or external movements.
- `Cash Out`, `Cash Out - Order`, `ATM Withdrawal`, and `Withdrawal` should normalize as cash/ATM expenses.
- `Cash Deposit` should normalize as a cash/ATM income row.

## Parsing Guidance

- Keep transaction descriptions intact in raw payloads.
- Do not collapse transfer and cash-out activity into generic spend unless the statement is genuinely ambiguous.
- If a row is transfer-like but not clearly an internal Clover transfer, let the worker/UI resolve it into income or expense by direction rather than forcing it to stay as a transfer display type.
- If OCR output is noisy or incomplete, fail closed and route the file to the vision/OCR fallback instead of inventing partial rows.

## Review

- Any row that cannot be confidently classified as transfer versus cash withdrawal should be routed to review.
