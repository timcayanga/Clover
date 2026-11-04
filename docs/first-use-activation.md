# First useful result

New accounts continue to start on Free. Onboarding defaults to Upload; Manual records a transaction directly using the normal default-account initialization. Bank linking remains an optional paid route. Skipping completes setup without creating financial records.

Home offers one entry or one import when the active Profile has no usable transaction. Starter Cash, account creation, file selection, failed/empty imports and zero-value drafts do not qualify. The existing notifications guide starts with recording a transaction rather than adding an account.

A usable transaction is persisted, nonzero, not deleted/excluded, and not rejected/duplicate-skipped. All entry methods qualify. Suggested rows are available results, not confirmed accuracy: their result card asks the user to check the details. This does not change review status or remove review requirements.

The first result shows the actual amount/currency/category and opens its dedicated details page, independent of pagination or current date filters. Transfers are described separately from spending. Historical dates are preserved; the card explains the original reporting period rather than inventing a current-month total or account balance. It expires after seven days or acknowledgement. Results are Profile scoped. No financial records, subscriptions or trials are changed.

## Measurement v1

- `activation_prompt_viewed`: client component rendered start/result on web; repeated renders are not independent activations.
- `activation_method_selected`: web manual/import choice. Intent only.
- `activation_first_result_rendered`: server-validated result rendered by web/native. Deduplicated per user and Profile under a Profile row lock. No amounts, merchant names or file content. Rendering is not proof that the customer read or verified it.
- `time_to_first_transaction_ms`: account creation to creation of the first currently retained qualifying transaction in that Profile. Transaction date is not the clock. `entry_method` is `import` or `non_file`; non-file must not be labelled exclusively manual.
- `first_transaction_within_24h`: per-Profile observation; deduplicate by customer for customer-level activation. This event is not the denominator. For the rate include every eligible external signup with a full 24-hour observation window, including no transactions, failures, no return visit, no analytics consent and no result render. Reconcile retained database rows across all their Profiles. Exclude staff, demos, automation and staging. Do not classify signup plan from current paid status.
- Separate confirmed/edited results from available suggested results. Pair the import branch with `import_attempt_finished` outcomes and latency, including failures, interruptions and pending attempts. Upload responses alone never count.

Audit actions `activation.result_viewed` and `activation.result_acknowledged` are operational records only. No backfill. Acknowledgement is explicit; snapshot queries remain read-only.

## Verification

`qa:onboarding` renders the actual card for empty, expense, income, transfer, hidden and expired states. The disposable PostgreSQL gate runs `first-use-activation-db-regression.ts`: seeded Cash, zero/rejected/duplicate/excluded/deleted rows, failed uploads, successful imported pending rows, dates/currency, Profile isolation, authentication/origin guards, concurrent deduplication and unchanged financial records/Free access. Native onboarding's executable harness covers all six destinations, repeated taps and retryable failure.

Native source changes require a future mobile release to reach installed apps. No new binary is part of this task. Web/API changes deploy to staging first.
