# Structured CSV and TSV parser rules

Use these rules for delimited financial exports (`.csv` and `.tsv`) that are not covered by a more specific institution parser.

## Routing

- Prefer schema-based parsing before institution-specific text or AI fallback.
- Recognize comma, tab, semicolon, and pipe delimiters, including Excel `sep=` directives.
- Search the first 12 rows for the most likely header so report titles and export metadata can precede the table.
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
- Unsigned credit-card amounts default to expenses.
- Preserve source categories when present; otherwise use Clover category inference.
- Preserve row-level account name, account number, institution, currency, running balance, reference, original headers, and source row index.
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

## Safety and confidence

- Never infer transactions from a date-and-balance-only table.
- Never use aggregate totals as transaction amounts.
- Do not overwrite confirmed transaction data during re-import.
- Keep original headers and row provenance in the raw payload for auditability.
- Schema-valid rows receive high parser confidence; inferred categories retain lower category confidence until confirmed or learned.
