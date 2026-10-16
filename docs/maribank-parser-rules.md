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
- Keep `Fund Transfer`, `InstaPay Transfer to GCash 9981`, and other external transfer rows as `Transfers`.
- Keep `Transfer Fee` as `Financial`.
- Keep `Meralco` and `Globe Postpaid` as bill-payment candidates.
- Keep `Promo Reward` and similar reward rows as `Financial`.
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
- Preserve the visible counterparty or merchant name in notes, especially for transfer, bill, and load rows.
- If the statement splits the counterparty across multiple lines, keep the full combined name in notes before the detail label.
- When the normalized name collapses to a generic `Transfer`, keep the richer parsed counterparty, detail line, or trailing note in the transaction notes instead of repeating `Transfer`.
- If there is no useful note, leave notes empty instead of writing raw import payloads.

## Review

- Unexpected `Other` categories or statement-housekeeping rows should be treated as parser review candidates.

## Complete native savings ledgers

A new native-page proof accepts the printed Philippine MariBank and older SeaBank savings layout only when every physical/printed page, dated native row, full eleven-digit account, PHP column, statement period and separate incoming/outgoing summary total agree. Both Starting Balance and Starting Savings Balance headers remain source labels. Missing rows or contradictory dates/amounts fail review; a weaker generic candidate cannot override failed recognized evidence.

Keep each printed occurrence, including identical transfers or purchases on the same day. Preserve monthly net interest as one source movement; daily interest/tax tables and illustrative balances are separate evidence. Column direction outranks narrative wording. Original descriptions, native row index and complete document evidence remain traceable.

Existing matched bank accounts are reused read-only, retaining customized labels, institution aliases, current balances and timestamps. New accounts can initialize from the source closing balance. Publish the actual current account projection before settlement. Later historical imports and retries cannot reset an existing balance to an older closing amount. Account ownership, currency/type, capacity, ambiguous identities and deletion tombstones remain guarded.

Future named savings statements use an additional v43-maribank-native-ledger namespace. Older cache entries, templates, corrections, sources and financial records are not refreshed or deleted.

## Explicit empty savings statements

Complete native MariBank/SeaBank statements with `NO RECENT TRANSACTION` inside the savings ledger, zero incoming/outgoing totals, equal opening/closing balance, one valid monthly period and full physical/printed page coverage retain exactly one `account_snapshot_marker`. They create **zero financial transactions**. A nonzero unchanged balance is not income. Dated movements, incomplete source fields or conflicting totals require source review; recognized native evidence cannot be replaced with OCR of disclosure illustrations.

The existing verified account resolver remains read-only for matched accounts. The source historical closing balance stays in the checkpoint and marker while status publishes the stored current account balance. Completed zero-transaction snapshots have a narrow locked retry path that leaves source, finance, learning and timestamps unchanged. Future named bank statements use additive `v44-maribank-native-snapshot` extraction entries; older v43/v39 entries and previous learning are retained.

Native source account values directly followed by the explicit contact label `Call` remain eleven-digit bank identities; longer numbers cannot be truncated. Verified native ATM withdrawals reuse the shared same-currency Cash mirror. Separate Card Fee/ATM Withdrawal rows remain expenses. The bank and Cash projections and complete normalized count are published before settlement, while existing account labels and balances remain read-only.

## Country boundaries in retained Scribd sources

Indonesian SeaBank `REKENING KORAN` documents print IDR, Indonesian contact details and twelve-digit bank identities. They are a separate native source family from Philippine PHP savings statements. Do not apply the eleven-digit PHP contract, truncate identity, interpret IDR grouping as Philippine decimal amounts, or infer a country from Scribd recommendations or a document title. Retain complete originals for independent regional column/page/running-balance review before accepted training.

Some Indonesian native PDFs wrap counterparties across several visual lines and split a single amount into adjacent font fragments. Read amount and balance cells within the date row's bounded vertical band, joining only touching numeric glyphs in the same monetary column. A native summary-cell proof may recover dot-grouped totals when text order scatters those digits; it must agree with the printed total and every dated running balance. Keep each repeated occurrence and all original text. Conflicting publication headers are source evidence, not transaction dates: retain the distinct strings, lower confidence, and use only the explicit statement period plus dated ledger rows. If any amount, column, page, balance, or total fails to reconcile, keep the source in review without partial financial training.

The older SeaBank Indonesia layout prints dated transfers/payments without a running-balance column, then a complete daily `PREVIOUS DAY BALANCE / INTEREST / WITHHOLDING TAX` table. Its month-only `Savings Interest` and tax entries are aggregates, not extra movements. Accept this layout only when the full twelve-digit account, Indonesian address, printed page sequence, period-matching serial and publication date, native IDR summary cells, every dated movement, every calendar day's interest/tax cells, monthly aggregate and each next-day balance all agree. Post positive daily interest/tax on their explicit daily dates, once each; preserve zero-interest days as evidence without creating zero-value transactions. Keep same-day repeated movements as separate rows. Recognize an explicit `Cash Withdrawal` as `Cash & ATM` without inventing an unprinted cash account. Contradictory serials, missing days, wrong columns or broken arithmetic stay held. This is an additive legacy contract and does not change previously verified running-balance statements.

Three retained legacy source filenames use a new extraction cache namespace so earlier incomplete extracts cannot bypass this proof. All earlier SeaBank cache namespaces and confirmed rows remain unchanged.
