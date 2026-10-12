# DBS consolidated statement source review

DBS consolidated multi-product statements are retained for independent review and dedicated parser support. The reviewed POSB Payroll/eEveryday single-account protocol is documented separately in `posb-parser-rules.md`.

Preserve each full account identity, product and currency. A single account may have separate SGD and USD balances; a zero USD balance is a distinct snapshot, not a transaction. Keep base-currency balances separate from SGD equivalents and aggregate summaries. Fixed deposits and their product details need their own reviewed mapping.

Complete account summaries, individual ledgers and physical/printed page coverage must reconcile before acceptance. Future imports must reuse existing identities without resetting confirmed current balances or edits, retain original evidence and source occurrences, finish durable jobs and leave settled reads/retries unchanged.
