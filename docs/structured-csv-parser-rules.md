# Structured CSV and TSV parser rules

Use these rules for structured financial exports (`.csv`, `.tsv`, `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, and `.ods`) that are not covered by a more specific institution parser.

## Routing

- Prefer schema-based parsing before institution-specific text or AI fallback.
- Recognize comma, tab, semicolon, and pipe delimiters, including Excel `sep=` directives.
- Accept `.csv` and `.tsv` uploads and decode UTF-8, UTF-16 LE/BE, BOM-prefixed, and Windows-1252 exports before parsing.
- Decode Excel and OpenDocument workbooks on the server, preserve cached formula results, and route each readable worksheet through the same deterministic schema parser. Never attempt to interpret the binary, ZIP/XML, or OLE payload as plain text.
- Preserve worksheet boundaries, names, indexes, source rows, and source columns in the audit payload. A successful account-inventory sheet must not prevent transaction or receivable sheets in the same workbook from being parsed.
- Detect independent tables arranged side-by-side on a worksheet. Parse each table in its own column range instead of combining duplicate `Date`, `Type`, `Name`, or `Amount` headers.
- When a worksheet explicitly labels adjacent tables as `Expenses` and `Income`, treat a generic `Type` column as the source category and use the table label as transaction direction.
- Search the first 12 rows for the most likely header so report titles and export metadata can precede the table.
- Read recognized institution, account, account-number, account-type, currency, and snapshot-date metadata from key/value preamble rows.
- Carry section-level account metadata forward in multi-account exports and ignore repeated header rows.
- Parse distinct account-summary and transaction-ledger tables from the same file, preserving a source section index and header row for auditability.
- Strip UTF byte-order marks and null characters, and preserve quoted delimiters, escaped quotes, and quoted multiline descriptions.
- A recognized but ambiguous delimited file must fail closed. Do not pass it to heuristic line parsing.

## Transaction ledgers

A transaction table needs all three:

1. A date or posted-date column.
2. An amount column or debit/credit columns.
3. A description, merchant, payee, or equivalent column.

Rules:

- Debit and credit columns take precedence over a generic amount column.
- Reject rows where both debit and credit are populated.
- Skip zero-value, unparseable, summary, and opening/closing-balance rows.
- Store transaction amounts as positive magnitudes; use the transaction type for direction.
- Explicit debit/credit/direction fields take precedence over amount signs.
- Without an explicit direction, negative values are expenses and explicit positive values are income.
- For unsigned amounts with a running balance, reconcile direction from the balance movement within the same account. Support both ascending and descending exports.
- Unsigned credit-card amounts default to expenses.
- Record the direction evidence (`debit_column`, `credit_column`, `explicit_type`, `amount_sign`, `running_balance_delta`, or fallback reason) in the raw payload.
- Preserve source categories when present; otherwise use Clover category inference.
- Preserve row-level account name, account number, institution, currency, running balance, reference, original headers, and source row index.
- Apply preamble account metadata only when the transaction row does not provide a more specific value.
- Skip pending, processing, failed, declined, rejected, cancelled, voided, expired, and reversed rows; preserve the source status for auditability.
- Preserve separate fee, original/foreign amount, and original/foreign currency fields without replacing the settled transaction amount.
- Recognize common bookkeeping aliases such as billing amount, ledger balance, settlement date, vendor, masked account, trace number, and CR/DR indicator.
- Treat `CR`/`DR` amount suffixes and indicator columns as explicit direction evidence.
- Append a description-only row to the immediately preceding valid transaction when it has no date or financial values, preserving the continuation row in the raw payload.
- Infer day-first or month-first order from explicit header formats and unambiguous dates, then apply that order consistently to ambiguous dates.
- Suppress an exact repeated row only when the file supplies the same stable transaction reference, date, amount, direction, and account identity. Do not collapse repeated same-day/same-amount rows that have no reference.
- Keep distinct row-level accounts as distinct Clover accounts.
- When a workbook ledger has no account identity in the row, table metadata, or worksheet name, use the existing default cash account instead of creating an account from the workbook filename or date-like worksheet name.

## Account inventories and balance snapshots

An account inventory needs:

1. An account-name column.
2. A balance column.
3. No transaction amount, debit, or credit columns.

Rules:

- Create one `account_snapshot_marker` per account identity. When the same account appears across dated rows, use the latest balance and preserve the complete balance history.
- Re-importing the same snapshot updates the matching account balance in place. Stable matching uses explicit account identity first and a unique institution/type/currency/balance match only to repair legacy generic cards; it must not create another account set.
- Investment account snapshots with a current balance remain visible in the Investments portfolio even when the file does not include security-level holdings.
- Preserve account type, institution, currency, account number, balance, and snapshot date.
- Ignore total/subtotal rows.
- Use the upload date only when no snapshot date is provided.
- Persist each account balance independently and expose all account summaries when the import reaches 100%.
- Do not create transactions from account inventory rows.

## Receivable worksheets

- Recognize itemized Accounts Receivable tables with an original amount, payee/counterparty, amount paid, and amount pending.
- Route each item to Recurring as a one-time receivable commitment. Open balances remain active; fully paid balances remain resolved.
- Link itemized receivables to the imported Accounts Receivable account without creating spending or income transactions.
- Preserve the original amount, paid amount, pending amount, source worksheet, source row, dates, purpose, category, and comments.
- When itemized receivables exist, do not also create a duplicate aggregate recurring commitment from the account balance.

## Wide balance-history tables

A wide balance-history table has:

1. A date or snapshot-date column.
2. At least one named numeric account column. A generic `Balance` column by itself is not an account identity.
3. At least two valid dated rows.
4. No transaction description, merchant, amount, debit, or credit columns.

Rules:

- Treat each qualifying account column as one account and the latest dated value as its current balance.
- Preserve the complete dated balance history for auditability.
- Exclude aggregate or derived columns such as total, net worth, assets, liabilities, change, gain/loss, return, and percentages.
- Infer institution, account type, and currency conservatively from recognized preamble metadata and account headers.
- Persist all account balances independently and do not create transactions.

## Safety and confidence

- Never infer transactions from a date-and-balance-only table.
- Never treat a time-only table as a dated transaction ledger.
- Never use aggregate totals as transaction amounts.
- Do not overwrite confirmed transaction data during re-import.
- Keep original headers and row provenance in the raw payload for auditability.
- Preserve parsed preamble metadata, balance deltas, direction evidence, and balance history in the raw payload.
- Record whether each usable running-balance movement matches the inferred transaction direction and amount.
- Schema-valid rows receive high parser confidence; inferred categories retain lower category confidence until confirmed or learned.

## Performance and visibility

- Decode and inspect all supported workbook sheets in one local deterministic pass before considering an AI fallback.
- Reject obvious data rows before running full header scoring so large ledgers do not repeatedly execute schema detection.
- Resolve independent account groups concurrently with bounded database concurrency and publish every account summary in the same confirmation result.
- Batch high-volume transaction inserts while keeping raw row provenance intact.
- Reuse identical transaction-context inference within one runtime instead of rescanning the context corpus for every row.
- Make accounts, transactions, and receivables durable before template promotion, analytics, QA, or representative training signals run.
- Evaluate enrichment only for suggested or review-pending rows, reuse one parallel-loaded training snapshot across batches, batch database writes, and resume from the saved cursor after a timeout.
- Large imports may sample redundant learning and analytics events; confirmed user edits remain authoritative and are never sampled away.
