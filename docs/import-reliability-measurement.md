# Import reliability and timing

## November 4 investigation

Read-only retained evidence included 19 failed external uploads and their original OCR/checkpoints. Several are historical failures already covered by later source-safety fixes. These are not 19 newly reproduced failures, nor 19 repaired customer imports.

Three remaining source patterns needed receipt routing: itemized restaurant BILLs, approved card-terminal sales slips, and VAT retail receipts with AMOUNT TO PAY. Identifying these earlier avoids a zero-row statement parse. Transaction histories and running-balance statements still take the statement path. Narrow restaurant column reconstruction requires agreeing quantities, item prices, subtotal, service-charge percentage and total. It never inserts missing digits or rewrites the original transcript. Card-terminal footer text cannot establish the merchant for local auto-save. Missing dates and contradictory currency/amount evidence still require better extraction or review. Generic payment-detail screenshots and incomplete crops are not automatically turned into expenses: transfer direction and missing evidence remain protected.

Original customer files and diagnostics remain private. No confirmed customer finance, source caches, learning projections or historical imports are changed by this fix. Synthetic regressions are independently invented source contracts, not new training labels.

## One operation per file

The public worker claims an `import.processing_attempt` audit while holding the ImportFile row lock. Concurrent HTTP, queue and sweep callers share the existing work without a second parser. Internal quality passes reuse that operation. The existing `processingAttempt` field remains a visual rerun number, not the true operation count.

A ten-minute lease exceeds the server request limit. A later claimant records an expired operation as interrupted before starting the next numbered attempt. Safe processing boundaries and the financial confirmation lock reject superseded/expired workers. Pause/cancel remains authoritative. Finalization is idempotent; analytics delivery cannot erase the durable record. Unreadable zero-row statement images are source-held with an actionable message instead of repeatedly extracted unchanged. Reconciliation and user review are not bypassed.

## Measurements

- **Known first-attempt success:** attempt 1 ends with committed transactions or a successful no-transaction completion (such as a valid empty account or holdings inventory), divided by all instrumented known first attempts. The report separately gives the stricter first-attempt transaction-delivery rate. Failed, input-required, pending, paused, cancelled and interrupted outcomes remain in both denominators. Legacy files with unknown earlier operations are excluded from these rates and reported separately.
- **Repeated processing:** files with multiple durable operations and the count of extra operations. Concurrent callers sharing a claim do not count twice. Separately uploading identical bytes is still a separate upload, subject to existing duplicate checks.
- **Server availability:** upload acceptance to first observation of a committed transaction, including later confirmation of a staged result. The first observation clock is retained without rewriting a previous outcome. This is a conservative upper bound, not a commit timestamp or proof of screen rendering. Transaction `createdAt` can precede commit and is not substituted.
- **Time to non-success:** upload acceptance to the first completed non-success outcome, separate from success latency. Expired running operations remain visible even without a replacement worker.
- **Ten-second result:** successes observed within ten seconds divided by all uploads whose ten-second window has elapsed. Failures and missing dispatch remain in the denominator. Historical files without timing cannot establish a historical ten-second rate.
- **Browser outcome:** one monotonic clock from submission through import-state publication, covering success, empty, failed and input-required results. Existing receipt `receipt_visible_in_ui` events additionally track cache/UI publication after the request; neither measures a rendered frame. New browser fields do not retrofit native code. Server metrics cover existing native apps without binaries; native screen-paint timing needs future native instrumentation.

Only operation IDs, phase, outcome and durations enter telemetry; no filenames, OCR, merchants, amounts, storage keys or source bytes. Durable audit is authoritative when analytics is missing. PostHog `import_attempt_finished` has `measurement_version=1` and an explicit server source; do not exclude server events as browser bots.

## Read-only report

From `web`, with the intended database explicitly configured:

```sh
npm run report:import-reliability -- 2026-11-04T00:00:00Z 2026-11-05T00:00:00Z
```

End is exclusive. The report uses a repeatable-read/read-only transaction, refuses ranges above 93 days or 20,000 uploads, and prints only aggregates. It includes staff/test uploads; segment those separately before presenting customer conversion. Account deletion legitimately removes retained evidence, so this is not an immutable lifetime count. Missing samples never become zero milliseconds. Do not present an old-cohort run as a post-release measurement.

## Verification contracts

Mandatory parser checks include independent receipt positive/negative cases and a fresh disposable-PostgreSQL worker race. One upload is held in source handoff while another entry runs; one parser persists exactly the original source occurrences. Tests cover failed timing, retry numbering, interruptions, stale-worker commit refusal, terminal holds, deleted-row evidence, repeat-safe availability clocks and unchanged prior confirmed finance. Aggregation tests include failures, holds, missing dispatch, interruption and legacy files. Historical corpus and real-worker preservation suites remain required. Private replay retains missing-source inventories and never regenerates answers from parser output.
