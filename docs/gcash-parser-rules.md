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
- GCash-family screenshot routing should classify the visible screen type before committing to the local parser path:
  - multi-account overview / account-list screens
  - transaction-history screens
  - account-detail / snapshot screens
- If a GCash-family screenshot visibly implies multiple cards or multiple transaction-history rows but the local parser only recovers a small subset of those visible entries, treat the parse as incomplete and escalate to transcript repair or backup parsing immediately instead of waiting for UI-level symptoms.
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
- Prefer an explicitly labeled `GCash Number`, `Wallet Number`, `Mobile Number`, `Phone Number`, or `Account Number` over phone numbers found inside transaction descriptions.
- Normalize Philippine mobile-number variants such as `0917 300 9926`, `+63 917 300 9926`, and `63-917-300-9926` to the canonical `09173009926` form before account matching.
- Run both the cleaned merchant and the preserved transaction description through the shared category corpus. Wrapper text such as `Payment to` must not hide an otherwise recognizable merchant.
- Keep outgoing `Sent GCash`, `Send Money`, and `Cash Out` activity in the `Transfers` category while retaining `expense` direction unless another user-owned account is matched.
- Normalize both incoming and outgoing PDAX wallet movement to `PDAX` and categorize it as `Financial`, while preserving the source debit/credit direction for account matching.
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

## Complete native wallet ledgers

For a text-native GCash Transaction History PDF with a printed starting balance, ending balance, dates, clocks, references, and running balances, keep the Philippine +08:00 transaction clock in the normalized timestamp and preserve the original clock and source line separately. A wallet number inferred from repeated transfer descriptions may identify the statement account only when that same number appears repeatedly on both sides of transfers and every parsed movement reconciles from the printed starting balance to the ending balance. Incomplete or contradictory native evidence requires source review; it must not silently fall through to a looser parser. Keep the full source PDF, raw descriptions and reference numbers. Do not infer a wallet number or balance for mobile screenshots and bill receipts.

Reconstruct descriptions split around PDF text rows using the source's reference/amount/balance cells, without borrowing a neighboring transaction's description or dropping a printed merchant transaction number. Preserve the exact native description separately from any humanized merchant label, and retain the printed clock in both parsed audit rows and normalized transactions. Distinct references remain distinct even when date, merchant and amount repeat. Only after the whole ledger validates may the worker retain source-proven identity and publish a reconciled checkpoint. Future named history PDFs use the additive `v51-gcash-complete-ledger-clocks` extraction namespace; existing caches, rules, labels, corrections and confirmed transactions remain unchanged.

The printed closing balance anchors the historical checkpoint. A repeat confirmation or historical import must not replace an existing wallet's confirmed current balance, even if that balance differs from the old statement. An empty new wallet may initialize from the fully reconciled closing balance. Preserve edited transactions and customized account names on repeat confirmation.

## Bills-payment email receipts

A receipt labeled `GCash Bills Pay Receipt` with a GCash reference is a single payment document, not a wallet history table. Preserve the printed bill and fee as separate PHP expense components; together they must equal `Total Amount`. Repeated email/visual/OCR copies of identical totals do not create additional purchases. Missing/conflicting values require source review. Use the payment `Date/Time` in Philippine time rather than the email delivery timestamp.

The receipt's `Account Number` belongs to the biller. Retain it in source evidence with the payment reference; leave the payer's wallet number absent unless the source independently identifies it. Generic identity fallback must respect that absence. Keep the complete source text and component evidence traceable. The portable `gcash-bill-fee-email` example uses invented identity and values; the private original is retained outside Git.

The stored-file reader validates the complete bill/fee fields before accepting a native email receipt layer. Some PDFs contain the net bill only in the rendered image even though their headers and summary are selectable text. Incomplete GCash layers require OCR; unrelated complete native receipts retain their fast path. Named GCash bills-pay receipts use the additive `v40-gcash-bills-receipt` namespace. Existing v39 cache entries, signals, rules and confirmed imports remain intact.

Bills-payment receipts do not prove a wallet opening or ending balance. The confirmation transaction publishes the existing stored account projection only after its balance calculation; first and repeated settled status reads must leave that checkpoint and its timestamp unchanged. This does not introduce a source balance anchor or change confirmed financial values.

## Reviewed bill receipt variants

Keep separate native PDF pages for multiple bill receipts. A distinct payment reference is a distinct event; repeated renderings of an identical reference count once, and conflicting repeated-reference financial fields require review. Reconcile each principal plus fee against its own total. The observed Total Name label is a total alias only inside this complete GCash bill-receipt shape. Zero fees do not create expense rows. Preserve alphanumeric and masked biller identifiers as evidence, never payer wallet identities. Read wrapped Date/Time fields in a bounded payment-label region, accepting split AM/PM glyphs and retaining seconds and the Philippine +08:00 convention. Require complete fields before accepting a native layer; an unrelated card label is not payer identity.

Native receipts may place a biller identifier between the Account and Number labels on adjacent lines. Retain alphanumeric and leading-zero values, reject conflicting labeled identifiers, and ignore a separate plain Account name/phone field. Older structured nulls can be retrieved from their unchanged stored source text through a read-only evidence projection; never rewrite confirmed financial/raw rows to backfill a field.

## Native payment clocks and tax receipts

A complete labeled payment clock may encode both visible colons as NUL font glyphs. Normalize only the exact hour/NUL/minute/NUL/second/AM-PM shape within the bounded Date/Time field; retain the original PDF and a lossless transcript with NUL represented as backslash-u0000 plus an explicit native encoding marker (escaping literal backslashes separately), because PostgreSQL cannot store a literal NUL. Mixed separators, invalid fields and contradictory totals still require review. Prefer a complete native bill/fee receipt before generic statement scoring; incomplete native fields continue to OCR/review. Future named receipts use additive v42 entries; retain v39/v40 and all existing learning.

BIR receipts can identify a tax form, branch, TIN, tax type and return period without a biller Account Number or payer wallet identity. Preserve those source fields without treating them as account IDs or dates. An explicit zero fee produces no extra movement.

## Explicit GInsure Bill Protect components

A complete bills-payment receipt may print `Bill Amount`, `GInsure Bill Protect`, `Fee`, `Amount Paid` and `Total Amount`. Keep the utility principal, positive fee and positive protection charge as separate PHP expense components. Require every labeled insurance/principal field, consistent repeated fields, and exact principal + fee + protection = total arithmetic. Zero components do not create movements. Duplicated same-reference reply art is one payment, while distinct references remain distinct. Partial labels, conflicting charges or unreconciled totals require source review.

Preserve the source protection label and amount, payment clock, reference, biller identity and complete raw receipt independently of normalized descriptions. The biller ID remains absent from payer wallet identity. Future named GCash bill receipts use additive `v45-gcash-bill-protect` extraction entries; all older caches, templates, rules, corrections and confirmed records remain intact.

## Scanned principal and wrapped biller recovery

When receipt OCR omits the principal label, try a separate complete lossless English page pass and accept it only through the existing receipt arithmetic/field validator. Never infer a missing Amount Paid field by subtraction or mix amounts from different OCR candidates. Preserve every physical page. A bounded Account + identifier + newline Number variant identifies the biller; a separate plain Account field remains distinct and never becomes a payer wallet identity. Entire source receipts remain in raw evidence; length alone cannot reject a component whose full receipt and date/currency/type/amount/reference reconcile. Contradictory templates and source instructions do not supply accepted financial labels.

Verified bill receipts prove payment components, not a current wallet balance. Reuse existing compatible GCash wallets read-only, preserving customized identities, all confirmed balances (including zero) and timestamps. A payer wallet ID is still absent from the source; numbered or ambiguous existing wallets require explicit selection. New empty identities may initialize the established known-movement balance. Historical receipts cannot replace a current confirmed balance with their standalone debit total. Ownership, currency/type, capacity and deleted-wallet guards remain enforced.
