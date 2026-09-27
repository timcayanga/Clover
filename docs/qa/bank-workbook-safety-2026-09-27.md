# Bank sync and workbook audit — 27 September 2026

## Checked

- Existing same-bank/full-number, currency and account-type matching, masked identity safeguards, explicit account selection, duplicate retries, pending entries, deleted-link tombstones and repeated same-amount transactions: Finverse preservation/reconciliation fixtures.
- Upload after sync: added one-to-one matching against bank-backed ledger rows, with uncertain overlaps excluded pending review. Confirmed/edited re-import rows now bypass all update fields. Both paths use the owner advisory lock.
- Manual after sync: existing endpoint validates account ownership and currency and creates an explicit confirmed row on that account; it does not rewrite provider records. Deliberately entering an already imported payment is not silently discarded.
- Four refresh attempts per connection per rolling 24 hours: durable reservations, concurrent requests, isolation and exact window boundary tested. Initial authorization, polling and data ingestion are separate.
- Excel variants: XLSX/XLS/XLSM/XLSB/ODS; account inventories, transaction ledgers, multiple tables, investments, cached formulas, 1904 dates, zero-padded numbers and incomplete financial worksheets.
- Backup: structured sheets normally remain local; unknown/partial financial workbooks can reach backup. Cloud permission applies. Templates record quality/provenance and candidate learning; generic AI output is not installed as executable parser code.

## Limits of verification

Tests use synthetic provider responses and generated workbooks, not customer records or paid live bank refreshes. They do not establish compatibility with every possible Excel layout, nor guarantee that a particular bank returns accurate data. Ambiguous identities require review/explicit mapping. No retrospective customer-data repair was performed. Store apps share the server refresh cap without needing a new binary.

## Verification completed

- Full `qa:prepush` passed, including web/native typechecks, release regressions, both native JS exports and the Next.js production build.
- The opt-in `bank-import-database-regression.ts` passed against a newly initialized localhost PostgreSQL `clover_bank_qa` database. It invoked the real import-confirmation worker, verified exact bank overlap suppression, review exclusion for uncertain overlaps, unchanged confirmed amount/date/description/exclusion on re-import, reuse of the bank account, and four durable reservations out of eight concurrent calls. External network access was disabled in the test process. Synthetic users were cleaned up and the temporary database server stopped.
