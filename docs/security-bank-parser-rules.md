# Security Bank Parser Rules

This document captures the Security Bank parsing rules learned from the synthetic training bundles and should be used as a reference for future Security Bank import work.

## Scope

- Applies to Security Bank deposit and credit-card statement PDFs.
- Treat bank and card statements as different statement shapes.
- Preserve raw and normalized records separately.
- Bank-specific title normalization is backed by `web/lib/merchant-labels.ts`.

## Deposit Account Rules

- Security Bank proof-of-account statements may use the `CUSTOMER DETAILS` / `TRANSACTION DETAILS` layout with `TRANSACTION DATE TRANSACTION DESCRIPTION DEBIT CREDIT BALANCE`.
- Keep the running balance and derive row direction from balance movement when the debit/credit columns are implicit in OCR.
- Use running balance as a first-class field.
- Keep payroll credits as `Income`.
- Keep `InstaPay Transfer to GCash 9981` as `Transfers`.
- Keep `InstaPay Fee` as `Financial`.
- Keep `Bills Payment - Meralco` as `Bills & Utilities`.
- Preserve `Interest Earned` and `Tax Withheld` separately.
- Treat `Month-End Adjustment` as a review-worthy adjustment entry.

## Credit Card Rules

- Keep `Cash Payment` as a card-payment credit, not income.
- Keep merchant rows intact when valid.
- Preserve merchant/category learning for travel, shopping, transport, business, food, and utilities.

## Review Gating

- Review adjustment entries and statement-housekeeping rows.
- Review anything that looks like a sweep or a non-merchant housekeeping line.

## Expected Outcome

- Security Bank imports should behave like a standard bank ledger plus a merchant card stream, with adjustments kept out of normal spending.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.
- The Security Bank simplifier registry covers `DPAC DGBanker Credit`, `ATWD ATM Withdrawal`, `IBFT Bancnet Tfr-CR`, `INSTAPAY FEE - DR`, `ATRO ATM/B2C ACCOUNT`, and `ATRC ATM/B2C ACCOUNT`.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
