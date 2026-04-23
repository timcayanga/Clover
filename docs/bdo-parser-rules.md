# BDO Parser Rules

This document captures the BDO parsing rules learned from the synthetic training bundles and should be used as a reference for future BDO import work.

## Scope

- Applies to BDO savings and BDO credit-card statement PDFs.
- Treat savings and credit-card statements as different statement shapes even when they share the same institution.
- Preserve raw and normalized records separately.

## Savings Statement Rules

- Use running balance as a first-class field.
- Keep salary credits as `Income`.
- Keep `InstaPay Transfer Fee` as `Financial`.
- Keep `Bills Payment` and other bank-to-bank payments as `Transfers`.
- Keep `Mobile Check Deposit`, `ATM Cash Deposit`, `Over the Counter Deposit`, and `PESONet Credit` as transfer-like credits unless the statement clearly says otherwise.
- Preserve `Interest Earned` and `Withholding Tax` as separate rows.
- Treat `Month-End Adjustment` as a special adjustment entry and review it instead of forcing a normal category.

## Credit Card Rules

- Keep `Cash Payment` as a payment credit, not income.
- Keep `Purchase Reversal` as a reversal/refund-style event.
- Preserve statement summary fields separately from transactions.
- Keep merchant-level rows intact when they have valid dates and amounts.
- Learn repeated merchant/category mappings from the user edits rather than flattening them to `Other`.

## Review Gating

- Review adjustments and reversal-like entries when the intent is unclear.
- Review rows that look like internal sweeps or statement housekeeping.
- If a card payment or sweep cannot be confidently mapped, do not silently classify it as spend.

## Expected Outcome

- BDO savings should import as a ledger with reliable balances.
- BDO credit cards should import as transaction streams with payments, reversals, and merchant purchases preserved.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.

## Simplification Layer

- Keep both the raw description and the simplified title when a BDO row can be normalized safely.
- Use the simplifier rules from `BDO_transaction_simplifier_rules.json` as durable mapping memory.
- The code-level lookup lives in `web/lib/merchant-labels.ts` so the same mappings apply automatically during parsing.
- Common simplifications include:
  - `W/D FR SAV BDO` and similar forms -> `ATM Withdrawal`
  - `SERVICE CHARGE DEBIT` -> `Service Charge`
  - `INTEREST PAY SYS-GEN`, `INTEREST EARNED`, `INTEREST CREDITED` -> `Interest Earned`
  - `INTEREST WITHHELD` -> `Tax Withheld`
  - `POB IBFT`, `BANK TRANSFER`, `Fund Transfer` -> `Bank Transfer`
  - `INTERBANK DEPOSIT`, `Funds Deposited`, `Received A/C` -> `Incoming Transfer`
  - `PAYROLL` -> `Salary Credit`
  - `CASH DEPOSIT` -> `Cash Deposit`
  - `MA_PC` -> `Merchant Payment`
- If OCR is heavily fragmented, prefer a readable normalized description over an aggressive simplification.
- If the statement already has a clear human-readable merchant/title, keep it instead of over-normalizing it.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
- Rows that collapse to ambiguous system text should retain the raw description for review.
