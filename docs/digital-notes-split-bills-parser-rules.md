# Digital Notes And Split-Bill Rules

- Detect worksheets with item rows, a total column, and people as columns as `split_bill_note`, never as a bank statement.
- Create one expense transaction for the verified bill total; never create one transaction per participant.
- Use Cash only when the funding account is absent. Never use a filename, date, or worksheet label as an account identity.
- Preserve items, participant totals, and per-item allocations separately from the transaction.
- Create a linked Split Bills record and group when at least two participant totals reconcile to the bill total within rounding tolerance.
- A participant share is an amount charged/owed, not evidence that the participant paid. Do not create payment or settlement records without an explicit payer/payment signal.
- If merchant, currency, payer, or date is absent, retain the raw worksheet, use a review state, and label the inferred field clearly.
- Source re-imports must be idempotent and must reject the legacy pattern of multiple `Shared bill: <name> share` transactions.
- Once transaction rows and raw source payloads are durably persisted, publish the usable transactions before Data QA and enrichment finish.
- Keep low-confidence fields review-required. Post-visible cleanup must never overwrite confirmed, edited, rejected, or otherwise user-controlled values.

### Receipt footer notices

A “No VAT / discounts / service charges” footer is administrative text, not a modifier of the last purchased item. Preserve the final item and reconcile the item subtotal against the printed total.

For core-only image receipts, the initial transcript intentionally omits item details. When no line items or allocations exist, refine from the original image after the core transaction becomes visible; absence of item keywords in that sparse transcript must not suppress refinement. Preserve confirmed transaction core values.

Once item quantity and price/amount columns are separated, preserve numeric product-name suffixes (for example Test snack 01). A number remaining in the product name is not another price token to discard.

A leading merchant header may end in a three-digit (or longer) branch/name suffix. If followed by dated receipt metadata and lacking a decimal/currency price or leading quantity, preserve that number in the merchant identity and exclude the full merchant header from item candidates. “Not valid for payment” notices are administrative text, including when other words in the notice have OCR errors. Never turn a merchant suffix into an item amount.

The integer-only unknown-currency reader must recognize decimal `Total Amount` and `Bill Amount` summaries and defer them to the existing decimal reader. Do not turn a decimal receipt into a blank integer preview because an earlier `Total Qty` OCR fragment was mistaken for the financial total. Missing currency evidence still requires review.

When a recognizer returns a separate column of standalone prices, use positioned rows only when the printed settlement independently reconciles. Preserve the original transcript and keep conflicting totals under review. Interpret a leading number as a purchased quantity when the table identifies its quantity column. Preserve numeric product names otherwise.

On printed quantity tables with a unit-price heading, separate the unit price from the description when quantity times unit price equals the extended amount. A digital receipt with one intact page, a reconciled purchase table and a matching payable can use its native PDF text directly. Ambiguous day/month dates remain open for review unless independent printed evidence resolves them.

A standalone numeric sale date or labeled reference identifier ends a pending purchase description. Exclude those rows from the item subtotal while keeping the raw transcript. Preserve merchandise names such as “Date Cake” and “Reference Book”. A separated currency marker beside a line price belongs with the price.
