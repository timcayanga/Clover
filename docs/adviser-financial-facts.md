# Adviser financial fact reconciliation

Adviser factual spending, upcoming-payment, and available-cash questions use authorized read-only calculations before any model or historical narrative. The active Profile is mandatory for native requests; an invalid explicit Profile or saved Profile cookie must not silently fall back to another Profile.

## Spending

- Use the same active-row policy and `normalizeReportRows` as Reports, including user edits and automatic-review inclusion. Do not cap retrieval to the newest 5,000 transactions.
- Resolve requested inclusive calendar days in the user's regional timezone. “Last month” means the complete previous calendar month. Transactions date filters use those same regional calendar boundaries (including DST), rather than UTC midnights. The chart uses those requested boundaries even when the first/last recorded expense occurs later/earlier.
- Rank expense categories only, in one explicit or default currency. Respect the requested top-N count. Do not add transfers or income to consumption spending; amounts and chart bars derive from the same rows.
- Shared `getTransactionSummaryTypeOverrides` recognizes an explicit retained transfer pair only when exactly two unedited legs in the authorized Profile agree on currency/amount/date proximity, use different accounts, and carry opposite equal signed movements. A category label or same-sized payment alone is insufficient.
- A linked reimbursement with explicit matching positive cash movement is an incoming credit in summaries. Explicit user edits remain authoritative. All underlying source rows, classifications, balances, evidence, and learning remain unchanged.
- Transactions full and paginated summaries load these same evidence-bearing rows. Reports, the Adviser chart, and the answer must reconcile.

## Confirmed payments

Use persisted active `FinancialCommitment` records and the same finite-term calendar, payment amounts, contractual completion dates, and completed occurrences as Recurring. Expand stale recurring anchors into the requested current window without writing dates back. Include actual due dates and distinguish an earlier planned date. Exclude suggestions, receivables, paused/resolved items, paid occurrences, other Profiles and other currencies. Missing dates/amounts are described as unavailable, never fabricated. Retrieval is not limited to the first 20 commitments.

“Next N calendar days” includes today and N−1 subsequent days; the response prints both exact boundaries. Unsupported/invalid date requests ask for clarification instead of silently selecting a different window.

## Spendable

Reuse Accounts/Reports checkpoint selection and balance projection (`reportAccountBalance`, including complete manual/Cash ledgers, receipt-checkpoint exclusion and statement effective dates), linked-bank snapshots, effective account presentation types, sign normalization, and `consolidatedAccountSummary`. Spendable adds positive bank/wallet/Cash balances; investments/debts are excluded. Unknown balances produce a labeled known subtotal. Never sum raw currencies; ask for a currency when a combined answer has no defined conversion basis. Accounts links preserve the requested currency.

A failed data read returns a limitation and no chart/figures, rather than zero balances, an empty-history claim, stale conversation text, or a model-generated substitute.

## Verification

- `adviser-facts-regression.ts`: dates, month/year/timezone boundaries, ranking, currency, explicit-pair proof and negative controls, reimbursements, schedule completion/finite terms, chart bounds and positive spendable arithmetic.
- `adviser-facts-db-regression.ts`: real Adviser POST, Transactions full/paginated GET, Reports GET, >5,000 recent rows, web/native/Profile isolation, current confirmed payments beyond 20 records, currency, stale-history rejection and database failure. Complete financial rows, checkpoints, schedules, completion evidence and learning are hashed before/after; providers are disabled.
- The full root `npm run qa:prepush` includes these tests. Real demo verification is read-only; never edit its records or substitute scripted tutorial answers to manufacture agreement.
