# GoTyme Parser Rules

This document captures the GoTyme parsing rules learned from the synthetic training bundle and should be used as a reference for future GoTyme import work.

## Scope

- Applies to GoTyme savings statement PDFs.
- Preserve raw and normalized records separately.
- Treat the savings ledger as a running-balance statement.

## Savings Rules

- Keep `Salary Credit` as `Income`.
- Keep `Fund Transfer` as `Transfers`.
- Keep `Transfer Fee` as `Financial`.
- Keep `Meralco` as `Bills & Utilities`.
- Keep `Debit Card Purchase` as spend with merchant/category learning.
- Keep `ATM Withdrawal` and `ATM Fee` as separate rows.
- Preserve `Interest Earned` and `Tax Withheld` separately.
- Treat `Adjustment Reversal` as a review-worthy adjustment entry.

## Review Gating

- Review adjustment reversals when the intent is unclear.
- Do not flatten housekeeping or adjustment entries into normal spend.

## Expected Outcome

- GoTyme savings should import as a clean running-balance ledger with standard income, transfer, fee, and adjustment handling.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable GoTyme simplifications such as `Grab`, `Move It`, `Lazada`, `Shopee`, `Transfer to Go Save`, `Transfer from Go Save`, `Transfer Fee`, and the interbank transfer variants.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
