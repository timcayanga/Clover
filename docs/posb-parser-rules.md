# POSB payroll statement rules

The reviewed Singapore payroll layout prints `Details of Your POSB Payroll Account`, `Account No.`, withdrawal/deposit/balance columns and an `As at` date. These headers identify POSB; a Wise counterparty inside a FAST payment must not identify the account as Wise.

Preserve amount column positions during PDF extraction. `POSB_TXN` lines retain date, direction, amount, optional running balance and every continuation detail/reference. Empty deposit/withdrawal cells carry meaning. Require one movement amount per dated row; ambiguous columns require source review. Keep all legitimate repeated occurrences and leading zeros in the account identity. Derive the transaction year from the printed statement date, allowing December in the preceding year for a January statement. Reject missing printed pages, invalid dates and contradictory running/closing balances.

The account is a bank in SGD. Withdrawals and incoming payments retain expense/income direction; source transfer wording alone cannot establish another user-owned account. Salary and interest are income candidates. Preserve counterparty/reference text separately from simplified titles. Native text without column evidence must not fall through to a confident Wise or year-2001 heuristic.

The first privately retained Scribd example was reviewed against all three rendered pages and independent arithmetic. Original documents and real identities are outside Git. The portable `posb-column-ledger` case uses invented values; the permanent real-worker regression also checks column extraction, repeated transactions, retry idempotence and durable learning. Review authority is Codex source review, not human confirmation or model fine-tuning.

Keep `FAST Payment / Receipt` in the Transfers category with explicit expense/income direction. The generic Landbank/cash normalizer serializes evidence and mistakes the withdrawal column label for an ATM description. Preserve the dedicated POSB classification through that normalizer; authoritative user corrections still apply. Only the statement's explicit `Cash Withdrawal` rows can use Clover's established ATM-to-cash counterpart behavior; preserve each counterpart's source transaction and account references. Derived counterparts are additional normalized entries, not additional parsed statement transactions.

Attach the versioned `posb-column-reconciliation-v1` proof only after source-row coverage, opening/closing arithmetic and every printed running balance pass. The existing checkpoint publisher can then use each row's `balanceReconciled` evidence. Missing anchors leave the proof absent; conflicting values or missing pages fail review. This proof applies to new POSB parses and does not refresh historical imports or change other institutions' checkpoints.

## Negative balances and non-movement disclosures

Preserve leading or trailing minus signs on printed balances, including a separately positioned native minus cell. Validate each running balance and closing arithmetic in cents. A printed zero Interest Earned row participates in source coverage and remains in reconciliation evidence; it does not create an income transaction. Other unexplained zero rows require review. ATM Withdrawal Fee and Service Charge remain Financial and never create cash counterparts. Full account identity must be consistent across pages; repeated FAST amounts/references remain separate source occurrences.

Source-verified POSB confirmation reuses existing matched bank accounts read-only, preserving current balances and customized identity. New accounts may use the verified source closing balance. Re-confirming or importing historical statements cannot restore an older printed balance over a newer confirmed balance. Ownership, capacity, currency/type, ambiguous matches and tombstone checks remain enforced.

Publish the normalized transaction count, including derived cash counterparts, and every actual stored bank/cash account summary atomically before marking a verified POSB import done. Parsed/source row counts remain separate. First and repeated status reads must not repair the ImportFile count or add a missing Cash summary to the checkpoint. This applies to future confirmations and does not refresh historical records.

## Address coverage and signed reversals

Source-row coverage recognizes actual month names; a street address beginning with a number and a three-letter word is not a transaction date. Missing dated movements still fail coverage. A signed negative movement in a proven withdrawal/deposit column reverses the financial direction while retaining the original column, signed amount, source line and occurrence. Match every running/closing balance. Preserve original transfers, reversals and later legitimate repeats as separate occurrences. Reversed cash withdrawals remain review-required, so they cannot produce an unsupported cash counterpart.

A downloaded PDF may concatenate several separately numbered monthly statements. Do not infer one statement period from its first header or Scribd's listing page count. The current single-period path keeps such sources outside accepted training until every period/page and overlap is independently verified.

## eEveryday Savings native statements

The explicit `Details of Your POSB eEveryday Savings Account` heading uses the same native withdrawal/deposit/balance protocol as Payroll. Keep full account identifiers, SGD, every page anchor and each printed occurrence. Both products must pass the existing column, year, page-count, running-balance and source-total checks. Other account products require their own review.

Cash withdrawals retain the existing same-currency Cash counterpart; separately printed fees remain expenses. Publish the bank and Cash projections/counts before settlement. Confirmed account labels and balances, source evidence and durable learning remain protected on retries. DBS consolidated statements with multiple products/currencies are a separate held source family; SGD-equivalent summaries cannot replace native-currency balances.

## Unpaired reversed cash evidence

A signed negative Cash Withdrawal with a different printed ATM/location from earlier cash movements does not prove which Cash counterpart to reverse. A same-amount positive withdrawal later in source order remains a legitimate separate occurrence. Preserve the incoming bank direction in private reviewed labels and the complete source; retain the existing reversed-cash review guard until a supported cash mapping is evidenced. Do not force training by deleting the guard or changing the sign.
