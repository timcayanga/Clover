# CIMB Parser Rules

This document captures the CIMB / GSave parsing rules learned from the training bundles and should be used as a reference for future CIMB import work.

## Scope

- Applies to CIMB / GSave statement PDFs.
- Treat CIMB as a structured savings ledger.
- Name accounts as `CIMB <last4>` from the visible savings-account number.
- Use the Deposit and Withdrawal columns as the primary source of truth for direction.
- Preserve raw and normalized data separately.
- Never silently merge multiple customers from one PDF.

## Statement Rules

- Use statement date range and account metadata as the starting point for identity.
- Keep summary totals, ledger rows, and reference numbers separate.
- Preserve interest and tax pairings as linked ledger logic when possible.

## Ledger Rules

- Treat deposit and withdrawal columns as stronger evidence than narrative wording when they conflict.
- Keep opening balances separate from activity rows.
- CIMB rows often split across lines: keep the narrative description from the lines before the dated amount row, then attach the date row's deposit, withdrawal, and balance values.
- Keep mixed-page statements split by account/customer when the PDF combines multiple profiles.

## Simplification Layer

- Keep both the raw description and the simplified title when a CIMB row can be normalized safely.
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

## Expected Outcome

- CIMB imports should behave like a structured savings ledger with reliable directionality and durable title mappings.
