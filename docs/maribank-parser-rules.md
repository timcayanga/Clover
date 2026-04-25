# MariBank Parser Rules

This document captures the MariBank parsing rules learned from the synthetic training bundle and should be used as a reference for future MariBank import work.

## Scope

- Applies to MariBank savings and MariBank pocket-flow statement PDFs.
- Treat MariBank as a digital-bank savings model with internal pocket flows.
- Preserve raw and normalized records separately.
- Bank-specific title normalization is backed by `web/lib/merchant-labels.ts`.

## Savings And Pocket Rules

- Use running balance as a first-class field.
- Keep `Salary Credit` as `Income`.
- Keep `Internal Transfer` rows as internal movement between MariBank balances or pockets.
- Keep `Fund Transfer` and `InstaPay Transfer to GCash 9981` as `Transfers`.
- Keep `Transfer Fee` as `Financial`.
- Keep `Meralco` and `Globe Postpaid` as bill-payment candidates.
- Keep `Promo Reward` as `Income`.
- Preserve `Interest Earned` and `Tax Withheld` separately.
- Treat `Adjustment Reversal` as a review-worthy adjustment entry.
- Keep `Transfer to Pocket` and `Transfer from Pocket` as internal movements, not spend.

## Pocket Handling

- Treat pocket-to-savings movements as internal transfers, not spend.
- Preserve the pocket account as its own account rather than merging it with the main savings account.
- Keep transfer direction explicit in the normalized name or notes when possible.
- Ignore statement-shell text such as summary banners, page labels, and support text when it does not belong to a transaction row.

## Review Gating

- Review adjustment reversals and any ambiguous internal movement.
- Do not let pocket-transfer metadata become a merchant purchase.

## Expected Outcome

- MariBank imports should preserve the separation between savings, pocket flows, transfer fees, and rewards.

## Parsing Guidance

- Prefer deterministic parsing from the statement text before any AI fallback.
- Keep raw statement data, parsed rows, and normalized transactions separate.
- Preserve bank-specific transfer, fee, sweep, and adjustment wording instead of collapsing it into generic spend.
- The MariBank simplifier registry covers `Internal Transfer`, `Fund Transfer`, `Transfer to GCash`, `Transfer Fee`, `Meralco`, `Globe Postpaid`, `Promo Reward`, `Adjustment Reversal`, and pocket transfer movement.

## Notes Handling

- Keep transaction notes human-readable and concise.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.
