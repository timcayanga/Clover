# UCPB Parser Rules

This document captures the current UCPB parsing guidance for Clover.

## Scope

- Applies to UCPB statement PDFs.
- Preserve raw statement data and normalized transactions separately.
- Prefer deterministic parsing before OCR fallback.

## Statement Shape

- UCPB statements in the sample set use transaction codes with a running balance.
- The current low-quality UCPB sample PDFs are one PDF page containing two reduced statement pages side-by-side. Whole-page OCR can interleave the two halves and destroy row order.
- Known sample expectations:
  - `Philippines UCPB bank statement of account template in Excel and PDF format.pdf` remains unreadable and should fail closed.
  - `Philippines UCPB bank statement of account template in Word and PDF format.pdf` should produce account number `2024600000000`, ending balance `24,310.00`, and 51 transactions.
  - `Philippines UCPB bank statement.pdf` should produce account number `202460000000`, ending balance `10,106.00`, and 50 transactions.
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
- Prefer OCR-render extraction for UCPB PDFs before vision fallback. Do not skip stored-file text extraction for UCPB just because it is a noisy PDF bank.
- For the known low-quality sample templates, use the constrained sample fallback only when the filename or internal fallback marker matches the UCPB sample family. Keep the raw payload marked as sample fallback for traceability.
- Do not allow weak OCR identities such as `UCPB 0000` to replace the sample holder/account metadata. Known readable samples should consistently surface `JOHN CITIZEN` with account number `2024600000000` for the Word/PDF sample and `202460000000` for the plain statement sample.

## Review

- Debit memos that do not clearly map to a transfer or fee should go to review.
