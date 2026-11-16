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

### PDF regression budgets

`web/scripts/pdf-latency-baseline.ts --check-budgets results.json` checks two independent milestones from the same upload start:

- `upload_start_to_first_visible_row` requires an imported row in the real Transactions viewport. For a traced run, use the actual client visibility observation. A commit timestamp, status poll, or rendered server HTML does not count.
- `upload_start_to_verified_statement` requires the complete labeled page set, matching committed ledger rows including repeated occurrences, and verified reconciliation. Use the moment the committed result can be verified against labels. Later merchant cleanup, recurring detection, and insight generation are outside this milestone.

Initial p90 ceilings are engineering targets in seconds. They are provisional until measured on each client with realistic network conditions.

| PDF class | First row, one page | Full completion, one page | Each additional page, first / full |
| --- | ---: | ---: | ---: |
| Text layer | 8 | 15 | 0.3 / 0.5 |
| Scanned | 18 | 35 | 0.9 / 2.5 |
| Hybrid | 14 | 30 | 0.7 / 1.8 |
| Multi-account | 14 | 30 | 0.7 / 1.8 |
| Password unlocked | 16 | 32 | 0.7 / 1.8 |

Assign the class from the fixture label. Use `password_unlocked` for automated unlocked runs, `multi_account` for the other consolidated statements, and the labeled extraction class otherwise. In an unlocked run, supply a known valid password through the supported flow without human wait. Tests expecting a password gate or review because pages or rows are absent are correctness controls. Keep them outside the completion-budget dataset. When a completion-eligible attempt unexpectedly reaches review, requires a password, fails, or is abandoned, keep it in the denominator and record its actual outcome for each milestone.

Each JSON input is an array of samples or an object with a `samples` array. Provide two entries with the same unique attempt `id`, `fixture`, `pages`, `pdfClass`, `pdfType`, `platform`, `network`, and `processing`. Set `boundary`, `outcome`, and elapsed `ms` separately. For `reached` first-row results, include `evidence.clientSurface` matching `ios`, `android`, `mobile_web`, or `desktop_web`. For `reached` full completion, include `evidence.pagesVerified`, `evidence.rowsVerified`, and `evidence.balancesVerified: true`. If no balances are printed, verify that the result preserves unknown balances.

The checker reports p50, p90, and outcome counts independently per milestone, grouped by class, page count, client, network, and cold/warm state. A measured cohort needs at least 20 attempts, a 95% reach rate, and a p90 within budget. The check exits nonzero for slow or insufficient cohorts. Add `--require-all-classes` to also fail when any class is absent. The labeled DB display test emits `PDF_QA_MILESTONE` records for local full verification. These server-only samples diagnose the completion path and cannot stand in for client end-to-end pairs.
