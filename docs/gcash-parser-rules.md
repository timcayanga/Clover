# GCash Parser Rules

This document captures the GCash parsing rules learned from the training bundles and should be used as a reference for future GCash import work.

## Scope

- Applies to GCash wallet history statements.
- GCash also hosts child products like `GSave`, `GFunds`, `GStocks`, and `GCrypto`, so the parent wallet and each child product should be handled separately when both are visible.
- Preserve raw and normalized data separately.
- Keep datetime information when the statement includes it.

## Wallet History Rules

- Treat GCash as a wallet account, not a bank account.
- Treat blue GCash mobile app `Transaction History` screenshots as GCash wallet imports even when no phone/account number is visible. Use account name `GCash`, leave `accountNumber` empty, and parse only visible rows from the screenshot.
- Overlapping mobile screenshots may show the same visible transaction more than once. Dedupe screenshot rows by wallet identity, date, visible time when available, signed direction/type, amount, currency, and merchant text rather than by screenshot filename or row number.
- GCash screenshot rows may use relative sections like `Today` and `Yesterday`; resolve them from the visible `As of <date>` header.
- In mobile screenshots, signed `Send Money` rows should use the sign for direction (`+` income, `-` expense) while staying in the `Transfers` category.
- When a screenshot clearly shows a GCash sub-product, create or update the matching child account instead of collapsing everything into one GCash bucket:
  - `GSave` for savings products like CIMB or UNO
  - `GFunds` for mutual funds like ATRAM
  - `GStocks` for brokered stock holdings like AB Capital Securities
  - `GCrypto` for crypto holdings
- Use `period_start` and `period_end` when the statement does not provide a single statement date.
- Preserve transaction time in the normalized date field when available.
- Only mark wallet movement as the `Transfer` type when Clover can match the other side to another user-owned account in the same workspace.
- Treat outgoing wallet movement to another person or external account, such as `Send Money` or `Sent via GCash`, as an expense unless Clover matches the recipient account to an existing Clover account.
- Treat incoming wallet movement from another person or external account, such as `Received GCash from`, as income unless Clover matches the source account to an existing Clover account.
- Keep `Cash In from BPI`, `Cash In from UnionBank`, `Transfer to Maya`, `Transfer to PDAX`, and similar wallet-to-wallet movement as internal transfers only when the matching BPI, UnionBank, Maya, PDAX, or other account is currently present in Clover.
- Keep `GCash Cash In` as a `Transfers` category even when the transaction type remains `income`.
- Keep merchant payments like `Meralco`, `Globe Telecom`, `Smart Postpaid`, `Foodpanda`, `GrabPay Top Up`, `MRT Transport`, `Alipay`, and `BancNet P2M` as category candidates based on the merchant.
- Keep `Transfer Fee` as `Financial`.
- Keep `Interest Boost Reward` as `Income`.
- Infer the wallet account number from transfer direction when the statement does not print it explicitly:
  - `Transfer from 09173009926 to 09175308181` with a debit means the wallet account is `09173009926`.
  - `Transfer from 09178303926 to 09173009926` with a credit means the wallet account is `09173009926`.
  - Preserve the source and destination phone numbers in the parsed row payload for downstream matching and learning.
- Some GCash statements span multiple pages and only print the final `0.00` ending balance on the last page; if the deterministic parser only recovers a small fraction of the expected rows, the import pipeline should treat it as incomplete and let the vision fallback inspect more pages.
- GCash OCR commonly wraps a single transaction across multiple lines, with a description fragment before the date line and another fragment after the balance; the parser should stitch those fragments back into one row instead of dropping them as separate records.
- Some OCR exports also merge multiple GCash rows into a single line or spill a bare `reference + amount + balance` tail onto the next line; the parser should split those fragments back into individual records before row assembly.
- OCR often fuses the date fragment into the merchant text on some exports; the parser should strip leading date noise and trailing amount-looking fragments before simplifying the merchant title.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable GCash simplifications like `Buy Load`, `Food Panda`, `Grab`, `Lazada`, `GCredit`, `GGives Repayment`, `Transfer to GSave`, and the `Received/Sent GCash` transfer variants.

## Review Gating

- Review adjustment entries and month-end adjustments.
- If a transaction description is too vague but still looks like a real wallet movement, keep it reviewable instead of inventing a category.
- Do not let statement boilerplate or support text become transactions.

## Expected Outcome

- GCash imports should preserve wallet movement, merchant payments, and transfer direction cleanly.
- Time-stamped wallet activity should remain distinct from bank-style statement ledgers.
