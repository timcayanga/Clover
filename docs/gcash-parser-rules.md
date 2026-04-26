# GCash Parser Rules

This document captures the GCash parsing rules learned from the training bundles and should be used as a reference for future GCash import work.

## Scope

- Applies to GCash wallet history statements.
- Preserve raw and normalized data separately.
- Keep datetime information when the statement includes it.

## Wallet History Rules

- Treat GCash as a wallet account, not a bank account.
- Use `period_start` and `period_end` when the statement does not provide a single statement date.
- Preserve transaction time in the normalized date field when available.
- Keep `Cash In from BPI`, `Cash In from UnionBank`, and other wallet top-ups as `Transfers`.
- Keep `Send Money`, `Received Money`, `Transfer to Maya`, `Transfer to PDAX`, and similar wallet-to-wallet movement as `Transfers`.
- Keep merchant payments like `Meralco`, `Globe Telecom`, `Smart Postpaid`, `Foodpanda`, `GrabPay Top Up`, `MRT Transport`, `Alipay`, and `BancNet P2M` as category candidates based on the merchant.
- Keep `Transfer Fee` as `Financial`.
- Keep `Interest Boost Reward` as `Income`.
- Infer the wallet account number from transfer direction when the statement does not print it explicitly:
  - `Transfer from 09173009926 to 09175308181` with a debit means the wallet account is `09173009926`.
  - `Transfer from 09178303926 to 09173009926` with a credit means the wallet account is `09173009926`.
  - Preserve the source and destination phone numbers in the parsed row payload for downstream matching and learning.
- Some GCash statements span multiple pages and only print the final `0.00` ending balance on the last page; if the deterministic parser only recovers a small fraction of the expected rows, the import pipeline should treat it as incomplete and let the vision fallback inspect more pages.
- OCR often fuses the date fragment into the merchant text on some exports; the parser should strip leading date noise and trailing amount-looking fragments before simplifying the merchant title.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable GCash simplifications like `Buy Load`, `Food Panda`, `Grab`, `Lazada`, `GCredit`, `GGives Repayment`, `Transfer to GSave`, and the `Received/Sent GCash` transfer variants.

## Review Gating

- Review adjustment entries and month-end adjustments.
- If a transaction description is too vague but still looks like a real wallet movement, keep it reviewable instead of inventing a category.
- Do not let statement boilerplate or support text become transactions.

## Expected Outcome

- GCash imports should preserve wallet movement, merchant payments, and transfer direction cleanly.
- Time-stamped wallet activity should remain distinct from bank-style statement ledgers.
