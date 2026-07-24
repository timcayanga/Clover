# Digital Notes And Split-Bill Rules

- Detect worksheets with item rows, a total column, and people as columns as `split_bill_note`, never as a bank statement.
- Create one expense transaction for the verified bill total; never create one transaction per participant.
- Use Cash only when the funding account is absent. Never use a filename, date, or worksheet label as an account identity.
- Preserve items, participant totals, and per-item allocations separately from the transaction.
- Create a linked Split Bills record and group when at least two participant totals reconcile to the bill total within rounding tolerance.
- A participant share is an amount charged/owed, not evidence that the participant paid. Do not create payment or settlement records without an explicit payer/payment signal.
- If merchant, currency, payer, or date is absent, retain the raw worksheet, use a review state, and label the inferred field clearly.
- Source re-imports must be idempotent and must reject the legacy pattern of multiple `Shared bill: <name> share` transactions.
