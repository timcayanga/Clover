# DBS consolidated statement source review

DBS consolidated multi-product statements are retained for independent review and dedicated parser support. The reviewed POSB Payroll/eEveryday single-account protocol is documented separately in `posb-parser-rules.md`.

Preserve each full account identity, product and currency. A single account may have separate SGD and USD balances; a zero USD balance is a distinct snapshot, not a transaction. Keep base-currency balances separate from SGD equivalents and aggregate summaries. Fixed deposits and their product details need their own reviewed mapping.

Complete account summaries, individual ledgers and physical/printed page coverage must reconcile before acceptance. Future imports must reuse existing identities without resetting confirmed current balances or edits, retain original evidence and source occurrences, finish durable jobs and leave settled reads/retries unchanged.

## Complete zero My Account snapshots

The native three-page single-SGD My Account and My Account (digiVault) layout can retain one account_snapshot_marker and zero financial transactions. Require matching full summary/ledger identity and statement dates, every physical/printed page, native balance-only dated row with empty movement/description columns, opening SGD0, zero withdrawals/deposits, and closing/summary SGD0. Other products, accounts, currencies, missing columns/pages or nonzero movements remain review-required. Existing matched account fields and current balances stay read-only; source historical balance is evidence. Publish stored projections before settlement and keep first/repeated status and confirmation unchanged.

Retained Savings Plus sources contain source arithmetic and identity contradictions; the supported empty snapshot must never accept them as generic POSB or DBS movements. Preserve the originals and reasons for correction.
