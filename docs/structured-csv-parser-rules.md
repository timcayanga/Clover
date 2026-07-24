# Structured CSV and TSV parser rules

Use these rules for delimited financial exports (`.csv` and `.tsv`) that are not covered by a more specific institution parser.

## Routing

- Prefer schema-based parsing before institution-specific text or AI fallback.
- Recognize comma, tab, semicolon, and pipe delimiters, including Excel `sep=` directives.
- Accept `.csv` and `.tsv` uploads and decode UTF-8, UTF-16 LE/BE, BOM-prefixed, and Windows-1252 exports before parsing.
- Search the first 12 rows for the most likely header so report titles and export metadata can precede the table.
- Read recognized institution, account, account-number, account-type, currency, and snapshot-date metadata from key/value preamble rows.
- Carry section-level account metadata forward in multi-account exports and ignore repeated header rows.
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
- Infer day-first or month-first order from explicit header formats and unambiguous dates, then apply that order consistently to ambiguous dates.
- Suppress an exact repeated row only when the file supplies the same stable transaction reference, date, amount, direction, and account identity. Do not collapse repeated same-day/same-amount rows that have no reference.
- Keep distinct row-level accounts as distinct Clover accounts.

## Account inventories and balance snapshots

An account inventory needs:

1. An account-name column.
2. A balance column.
3. No transaction amount, debit, or credit columns.

Rules:

- Create one `account_snapshot_marker` per valid account row.
- Preserve account type, institution, currency, account number, balance, and snapshot date.
- Ignore total/subtotal rows.
- Use the upload date only when no snapshot date is provided.
- Persist each account balance independently and expose all account summaries when the import reaches 100%.
- Do not create transactions from account inventory rows.

## Wide balance-history tables

A wide balance-history table has:

1. A date or snapshot-date column.
2. At least two numeric account columns.
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
- Never use aggregate totals as transaction amounts.
- Do not overwrite confirmed transaction data during re-import.
- Keep original headers and row provenance in the raw payload for auditability.
- Preserve parsed preamble metadata, balance deltas, direction evidence, and balance history in the raw payload.
- Record whether each usable running-balance movement matches the inferred transaction direction and amount.
- Schema-valid rows receive high parser confidence; inferred categories retain lower category confidence until confirmed or learned.
