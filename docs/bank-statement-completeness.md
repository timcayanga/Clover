# Bank-data completeness and accuracy evidence

A successful bank sync, a product `SUCCESS`, a matching balance, and agreement between a provider payload and normalized fields do not establish bank-data accuracy. Finverse's Data API describes retrieval of balances/transactions/statements; coverage must be established for the specific account and period, not assumed from general provider capability. See https://docs.finverse.com/ and https://www.finverse.com/bank-data-api .

## Three separate checks

1. Independently label the original statement, then compare it with retained provider rows. Report each missing, extra, invalid and exact occurrence. Preserve two equal purchases on the same day as two occurrences.
2. Compare each provider record's actual ledger reference to its saved counterpart, including aliases, account, posted date, currency and signed amount. A matching multiset alone must not hide a wrong or shared reference. This is internal fidelity, not independent statement accuracy.
3. Compare the original with the bank-linked ledger rows. This assesses saved bank data, not the whole account ledger: manual/imported transactions without provider links are outside this snapshot. Do not credit unrelated imported rows as successful bank retrieval. End-user screen rendering requires the separate first-visible-data checks.

Description equality is shown separately from core date/amount/sign/currency/account agreement. A saved description can legitimately retain additional printed reference/details; differences require review, not an automatic financial correction. Candidate field mismatches are unconfirmed diagnostic hints with low confidence, and never count as exact matches.

## Required ground truth

- Original bytes with SHA-256 and actual physical page count. Review every physical page, including covers, reverse-side forms and blank pages; printed page numbering can differ.
- Independently transcribed rows with stable occurrence IDs and physical page evidence. Labels derived from the same provider or Clover parser cannot validate that output.
- Explicit bank and account binding, including the Clover account targeted by saved records. Same merchant/amount alone cannot establish identity.
- Exact statement period and an explicitly verified date basis. Do not hide a posting/transaction-date disagreement using a date tolerance.
- Signed decimal strings and printed currencies. No FX conversion, amount tolerance, automatic rounding or guessed sign. Credit-card and deposit balance conventions stay explicit.
- Human confirmation before a case can be marked verified. Agent-reviewed transcription remains provisional, even when all observed rows agree.

## Coverage and claim gate

Do not infer the provider's coverage from the first and last returned transaction. That would make missing boundary rows invisible. Record an independent retrieval window, its evidence, completion/pagination status and a source data-as-of date. A retained snapshot with no such evidence remains `unknown`, even if its fields agree internally. Empty denominators never become 100%.

`validateBankStatement` can mark only one account/window verified when source integrity, complete page review, confirmed labels/account/date basis, coverage/retrieval evidence, exact rows, provenance and applicable printed-balance checks pass. It never authorizes a bank-wide accuracy claim. Broader claims require separately held-out original statements across accounts, periods, currencies and banks, with the denominator, collection method, failed/missing samples and unresolved cases disclosed. Synthetic tests establish verifier behavior only.

Printed opening/closing balances reconcile against all labeled statement movements where available. A provider balance is comparable only in the same currency at the same statement cutoff; today's balance is not ground truth for an earlier statement. A last-sync timestamp is not a bank-reported data-as-of time or proof of a statement-closing balance; the exporter leaves both unknown when the retained payload lacks that evidence. Never add balancing entries or change confirmed transactions to force agreement.

## Read-only commands

Run from `web/` with explicit, privately supplied database configuration:

```sh
npx tsx scripts/export-bank-statement-snapshot.ts \
  --environment production --workspace WORKSPACE_ID \
  --connection CONNECTION_ID --account EXTERNAL_ACCOUNT_ID \
  --out /private/qa/snapshot.json

npm run validate:bank-statement -- \
  --labels /private/qa/original-labels.json \
  --snapshot /private/qa/snapshot.json --out /private/qa/report.json

# An overlap can be inspected without pretending it validates the full statement.
npm run validate:bank-statement -- \
  --labels /private/qa/original-labels.json --snapshot /private/qa/snapshot.json \
  --from 2026-07-06 --through 2026-07-07 --out /private/qa/overlap.json \
  --require-verified true
```

The exporter uses a bounded Repeatable Read transaction, sets and verifies PostgreSQL `READ ONLY`, requires a mapped account in the requested workspace/environment, and selects no bank tokens or credentials. More than 50,000 rows stops the export instead of silently truncating. It deliberately emits unknown provider coverage/retrieval status; do not fill them from observed min/max dates. Calendar dates are formatted in SQL rather than passed through the host's timezone parser. Amounts remain decimal text. No database mutation, parser, enrichment or AI call is involved.

The offline verifier requires Python `pypdf` to independently check source page count; encrypted sources without an unlocked copy block verification. Source PDFs and inputs are not overwritten. Keep all financial labels, snapshots, renders and row-level results private, outside Git; never write generated artifacts into Actual folders. Do not share account IDs or statement contents in analytics. A report may contain only scoped aggregate counters in shared summaries.

The command defaults to a fail-closed gate: exit 2 for an unverified case, 1 for invalid input or unreadable sources, and 0 for a case that meets the scoped gate. `--diagnostic` explicitly permits writing an unverified report with exit 0. `--require-verified` (with or without `true`) keeps the gate enabled even alongside `--diagnostic`. Bank-wide claims remain disallowed in every mode.

## Initial historical check — November 18, 2026

The available original BPI savings statement spans April 7–July 7, 2026: four physical pages, 17 transaction occurrences. Six statement occurrences overlap July 6–7 in the owner's retained bank records. All six agree on account, date, currency and signed amount in both the provider and the linked ledger. Both repeated 100-value transfers remain distinct. Five saved descriptions are exact; one preserves additional transfer-reference/details and needs review for description equivalence. Printed statement totals reconcile.

This is a historical owner overlap, not a representative customer test or held-out bank-accuracy study. Eleven earlier statement occurrences are absent from the retained snapshot, but the provider's original historical coverage is not retained; they cannot be labeled provider extraction failures from this evidence. Provider rows after July 7 lack a matching original statement here. Matching Metrobank originals are password-protected. Labels are agent-reviewed and await human confirmation. Full-period and bank-wide accuracy remain unverified.

The audit initially exposed a host-timezone conversion in the export of PostgreSQL calendar dates. SQL-formatted dates corrected the audit, not financial records. Exports under Asia/Manila and UTC now produce identical financial fields. No confirmed transactions or balances were changed.
