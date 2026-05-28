# CIMB Parser Rules

This document captures the CIMB / GSave parsing rules learned from the training bundles and should be used as a reference for future CIMB import work.

## Scope

- Applies to CIMB / GSave statement PDFs.
- Treat CIMB as a structured savings ledger.
- Name accounts as `CIMB <last4>` from the visible savings-account number.
- Prefer the customer name on the line that ends with `Reference No.` over OCR logo/header text such as `I M = B A N K` or `Statement of Account`.
- Use the Deposit and Withdrawal columns as the primary source of truth for direction.
- Preserve raw and normalized data separately.
- Never silently merge multiple customers from one PDF.

## Statement Rules

- Use statement date range and account metadata as the starting point for identity.
- Keep summary totals, ledger rows, and reference numbers separate.
- Preserve interest and tax pairings as linked ledger logic when possible.
- Keep statement-shell rows like `Opening Balance`, `Beginning Balance`, `Closing Balance`, `Statement of Account`, and page labels out of the transaction stream unless they are explicit ledger movements.

## Ledger Rules

- Treat deposit and withdrawal columns as stronger evidence than narrative wording when they conflict.
- Transfer-like descriptions are not automatically internal transfers. If the target/source account is not present in Clover, the ledger direction should become `income` for deposits and `expense` for withdrawals.
- Keep opening balances separate from activity rows.
- CIMB rows often split across lines: keep the narrative description from the lines before the dated amount row, then attach the date row's deposit, withdrawal, and balance values.
- Keep mixed-page statements split by account/customer when the PDF combines multiple profiles.
- When one CIMB PDF contains multiple `GSave - Savings Account No.` sections, preserve all sections and let import confirmation create/link one Clover account per account number instead of choosing a single "best" section.

## Simplification Layer

- Keep both the raw description and the simplified title when a CIMB row can be normalized safely.
- Categorize transfer-like CIMB activity as `Transfers` while preserving ledger direction as `income` or `expense` unless the transaction is proven to move between Clover accounts.
- Use the simplifier rules from `CIMB_transaction_simplifier_rules.json` as durable mapping memory.
- The code-level title lookup lives in `web/lib/merchant-labels.ts` so the same mappings apply automatically during parsing.
- Common simplifications include:
  - `Credit Interest account` -> `Credit Interest`
  - `TAX RATE` -> `Tax Withheld`
  - `Back Office Cash In(ICMS)` and `Back Office Cash In` -> `Cash In Adjustment`
  - `Instapay Inward Transfer to` / `InstaPay Inward Transfer to` -> `InstaPay Inward`
  - `InstaPay Transfer to` -> `InstaPay Transfer Out`
  - `Transfer to Vicky Antonio Chavez` -> `Transfer to Vicky Antonio Chavez`
  - `Transfer to Antoinette Ann Lorenzo` -> `Transfer to Antoinette Ann Lorenzo`
  - `Opening Balance` -> `Opening Balance`
- OCR can fuse `ATM Withdrawal`, `InstaPay`, and similar phrases into one token; the shared merchant simplifier should decompact those before applying rules.
- If wording conflicts with the deposit/withdrawal columns, keep the simplified title short but lower confidence and send it to review when needed.
- If no rule matches, show normalized_description.

## Review Gating

- Review rows where wording conflicts with the ledger columns.
- Review ambiguous transfer rows and mixed-page statement splits.
- Do not let branding footer or generic boilerplate become transactions.
- Downloaded copies of the same statement with different filenames should share a duplicate fingerprint; filename alone must not make a statement unique.

## Expected Outcome

- CIMB imports should behave like a structured savings ledger with reliable directionality and durable title mappings.
