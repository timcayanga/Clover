# Maya Parser Rules

This document captures the Maya parsing rules learned from the synthetic training bundles and should be used as a reference for future Maya import work.

## Scope

- Applies to Maya wallet, savings, and credit statements.
- Treat wallet, bank, and credit-card statements as different statement shapes.
- Preserve raw and normalized records separately.

## Wallet Rules

- Treat Maya Wallet as a wallet account, not a bank account.
- Use `period_start` and `period_end` when the statement does not provide a single statement date.
- Preserve timestamps when present.
- Keep `Cash In from BPI`, `Cash In from UnionBank`, `Send Money`, `Received Money`, `Transfer to Maya Savings`, `Transfer to GCash`, `Transfer to Maya Credit`, and `Fund Transfer` as `Transfers`.
- Keep `Meralco`, `Smart Postpaid`, `Foodpanda`, and `GrabPay Top Up` as merchant/category candidates.
- Keep `Transfer Fee` as `Financial`.
- Keep `Interest Boost Reward` as `Income`.

## Savings Rules

- Use running balance as a first-class field.
- Keep `Salary Credit` as `Income`.
- Keep `Interest Earned` as `Income`.
- Keep `Tax Withheld` as `Financial`.
- Keep `Adjustment Reversal` as a review-worthy adjustment entry.

## Credit Card Rules

- Keep `Cash Payment` as a payment credit, not income.
- Keep `OpenAI ChatGPT Subscription` as `Business` for this user.
- Keep travel, shopping, food, transport, and merchant refunds as learned category candidates.
- Review `Month-End Adjustment` and other housekeeping entries.

## Review Gating

- Review adjustment entries and month-end adjustments.
- Do not let boilerplate or support text become transactions.

## Expected Outcome

- Maya wallet imports should preserve time-stamped wallet movement cleanly.
- Maya savings and credit imports should stay distinct and keep adjustment logic visible.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.
- The code-level title lookup lives in `web/lib/merchant-labels.ts`; use it for durable Maya simplifications such as `Base Interest`, `Boost Interest`, `Transfer to BancNet`, `Credit Drawdown`, `Repayment`, and `Documentary Stamp Tax`.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
