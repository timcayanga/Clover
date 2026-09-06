# Import visibility and default-account contention

## September 6, 2026 incident

A staging trace showed 11 statement rows parsed and persisted in 445 ms, followed by 294,609 ms spent attempting confirmation. The failures were PostgreSQL statement timeouts in the starter/defaults advisory lock and an expired 5-second transaction in `account.updateMany`. The eventual successful confirmation took 933 ms. This was not a slow bank parser or AI enrichment request.

`ensureWorkspaceCashAccount` acquired the workspace defaults lock and attempted a legacy-name update for every call, even when Cash already existed. Profile GET requests launched defaults-seeding transactions with an unowned promise after responding; a suspended serverless request could retain a transaction/lock until database cleanup. Category seeding also used one write per category.

## Changes

- Existing Cash and fully initialized Profile defaults take a read-only fast path. Creation/repair still rechecks inside the shared advisory lock, preserving concurrency safety and user data.
- Starter locks use a transaction-local 1.5-second lock timeout. A blocked request rolls back promptly instead of consuming minutes; existing import confirmation retry handling remains in place.
- Missing categories are inserted in one batch under the lock. Profile background work uses Next.js `after()` and catches failures, rather than leaving unowned transactions.
- Statement enrichment queue setup also uses the owned post-response scheduler. Status recovery can resume queued/retrying enrichment as well as stale jobs; enrichment never gates visible-import completion.
- The dock labels real phases instead of inventing “Enriching transactions” at 75–94%. Removed the stale 700-ms finalizing timer that could overwrite newer progress.
- Background imports invalidate the relevant UI data when saved rows become visible, before secondary summary checks finish. Success still requires durable results, not an optimistic parser preview.
- Settlement checks react immediately to complete/snapshot events, avoid overlapping account reads, and fall back to HTTP after a silent stream rather than spending the full deadline waiting on SSE.

## Verification

- `npm --prefix web run qa:import-status-stream` now includes the new readiness regression: truthful phases, visible rows independent of enrichment, immediate completion event, silent-stream fallback, bounded setup, and owned background work.
- `web/scripts/import-latency-local-regression.ts` requires `DATABASE_URL` pointing to loopback database `clover_import_latency_test` and refuses other targets. Initialize that disposable database from the Prisma schema. Run from `web/` with `npx tsx scripts/import-latency-local-regression.ts` (normal React conditions).
- The real-Postgres test holds the defaults advisory lock, confirms 11 persisted fixture rows for bank/wallet/credit-card accounts, checks settled UI status, preserves an existing confirmed transaction, and verifies eight concurrent requests create only one Cash account.
- Observed locally: existing Cash/default checks 1 ms each under the held lock; missing Cash fails in 1,552 ms; fixture confirmations 18–64 ms. These are controlled local measurements, not an end-to-end production SLA or a guarantee for OCR, network transfer, large files, or provider latency.
- No customer source files or confirmed financial data are altered by this change. Raw/parsed audit records and existing reconciliation checks are preserved.
