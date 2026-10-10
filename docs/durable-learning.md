# Durable learning and retrieval

This extends the preserved `ca1c516a` release. Existing signals, merchant and account rules, templates, original files, and the sealed knowledge snapshot remain intact. No backfill, reupload, mass reparse, or production financial mutation is part of this release.

## Persistence contract

`LearningJob` retains immutable, versioned learning input, its source reference and Profile, a content digest, progress, counts, and status. `LearningJobAttempt` retains each worker attempt and its failure reason. Input contains the required observation and correction values; it does not copy whole source documents. These are private Profile data and cascade with Profile/account erasure.

- Import confirmation queues **every** prepared transaction observation in the same database transaction as its financial writes. It no longer deletes old confirmation signals or replaces them with a 50/200-observation sample. Source transaction IDs distinguish legitimate repeated purchases. Backup-parser suggestions use their import reference, never invented transaction foreign keys.
- Manual transaction creation/editing, manual account creation/editing, offline transaction creation, confirmed Ask Clover entries, and Data QA feedback commit their learning request with the source change. Failed enqueue rolls back that save rather than silently accepting an edit without its learning request. Worker execution follows the commit.
- Generic confirmed JSON training calls persist their observation job before applying it. Re-running the same source resumes/deduplicates surviving observations; it does not replace the corpus. Existing JSON-upload review policy is unchanged.
- Automatic template work is saved before scheduling and waits for source completion/receipt review. Its template and inactive merchant candidates commit together. JSON-upload template writes also use saved jobs; repeated inputs do not inflate example counts. Rejected or suspended candidates remain unchanged.
- Each worker item writes its signal, derived rules and progress checkpoint in one transaction. Failed items roll back completely. Previously committed items and counters are untouched on resume. Overlapping batches also deduplicate signal observations.
- Each slice reads immutable batch input once; checkpoint reads/writes omit it. A real PostgreSQL transfer-budget test prevents batch-sized payloads from being sent again for every item.
- A two-minute lease and token fence prevent competing workers from applying the same checkpoint. Expired workers are recorded as interrupted. Bounded slices yield back to `queued` without restarting at item zero.
- Newer corrections take precedence over older queued work. Exact manual rules cannot be replaced by automatic suggestions. Transaction revision checks discard superseded manual edits. Suspended/rejected rules and inactive signals do not become active through an automatic retry. The immutable job input retains correction history separately from the current signal/rule projection.
- Jobs check Profile ownership of referenced categories, transactions, imports and accounts. Learning never edits transactions, balances, currencies, source files or parsed evidence. Privacy consent is checked at enqueue and again during processing; withdrawal cancels remaining work.

The existing signal source names are preserved. `import_confirmation` is **not** proof of human review. Automated QA uses an automatic source instead of claiming manual recategorization. Counts of applied/skipped items are processing outcomes, not independent documents, new training examples, or human confirmations.

## Retrieval contract

The ordinary bounded candidates remain available. For an import or manual category suggestion, Clover also queries relevant keys throughout that Profile's stored knowledge before applying candidate limits:

- Exact merchant keys, normalized variants and known family signatures have no age/popularity cutoff. Fuzzy queries search the Profile by relevant tokens and limit candidates per token batch.
- Exact correction lookup prioritizes manual corrections, then the latest active observation time per merchant before limiting candidates. A delayed retry cannot look newer merely because it finished later. Inactive signals are excluded.
- Older exact account keys and statement-family signatures are retrieved beyond their previous 250-account and 5/16-template windows.
- Exact manual merchant rules outrank high-count fuzzy matches. Existing source-app preservation, deterministic category policies, confidence and review behavior remain in force.
- Manual suggestions use the requested merchant text; the old Profile-wide cache can no longer conceal a just-saved correction.

The current rule/signal tables are the compact retrieval projection. Historical job payloads are retained for diagnosis and replay; deleting/rebuilding those tables is not a supported refresh operation. This release does not globally load all customer knowledge into memory, share rules across Profiles, or automatically promote candidates.

## Operations

Open **Admin → Data QA → Learning jobs** (`/admin/data-qa/learning`). The page shows queued, running, completed, failed and cancelled jobs; processed/applied/skipped item counts; source/Profile references; safe error codes and reasons; and recent attempt history. Older jobs are paginated. It does not send private observation payloads, SQL, credentials, or raw driver errors to the browser.

Reading requires admin access. Retry/resume additionally requires `operate` permission and a trusted request origin. Both API methods scope records to the deployment's account environment. Retry preserves payload, progress and attempt history. It cannot turn consent-cancelled jobs back on.

Normal post-response work processes saved jobs. Import-history visits continue queued work, and the existing authenticated daily import-recovery cron also processes learning jobs. Admin retry/resume is available for immediate recovery, including staging where scheduled production recovery may not run. Database connectivity/transaction failures receive at most three automatic attempts with backoff; unfinished-source jobs wait without consuming failure attempts; invalid input/schema/reference failures remain visible for an operator to resolve. No live corpus or financial records are rewritten merely by deploying this code.

If the database itself cannot accept a claim/error update, the last durable queued state or lease remains recoverable. A worker does not claim completion without its checkpoint commit.

## Schema and rollback

`20261009150000_durable_learning` is additive: two new tables, nullable observation-order/idempotency fields, and an exact-retrieval index. It enables RLS and revokes all Supabase API-role access to the new private tables. It has no data deletion, label rewrite, or mass promotion. The usual Vercel migration step must succeed before serving this release.

Keep these tables and columns during a code rollback. They are durable user learning, not a cache. A worker with a different payload version must leave the job failed and reviewable. Do not roll back to a worker that deletes import signals; use a corrective release that retains the durable-write contract. The independently sealed preservation archive remains a recovery source and is not changed by migrations or tests.

## Required verification

The isolated PostgreSQL release gate now includes actual additive-migration SQL and fault-injected learning tests. It verifies legacy IDs/counts/versions/correction history; atomic outbox rollback; partial progress; concurrent retries; expired leases; a 205-observation batch; rules beyond 500 newer records; inactive exclusion; manual authority; Profile/consent boundaries; authenticated admin retries; environment isolation; safe error responses; and unchanged financial/source records. Existing reviewed parser, real-worker preservation, migration, bank-link and application checks remain required.

New incidents need a minimized source-reviewed fixture and expected behavior. Never reset learning or regenerate historical labels just to make a release pass.

## Correction retrieval before confirmation

Live staging verification exposed a gap: deterministic imports were confirmed before the background enrichment worker could consult saved corrections. The worker correctly refused to rewrite confirmed rows, so later CSV imports and the separate receipt finalizer missed learned labels.

New transaction creation now consults the existing Profile-scoped rule retrieval before confirmation. Only exact, active manual rules with at least 85 confidence apply here; institution-specific matches win over global aliases. Category references must belong to the same Profile and agree with the parsed transaction direction. Fuzzy and automatic suggestions retain their existing review path. Source-app migrations retain their source labels. Account identities, amounts, dates, currencies, balances, raw descriptions and parsed evidence are unaffected by this label lookup. Normalized transactions retain the applied rule key/version, source, confidence and reason. Existing confirmed/edited/rejected transactions remain protected, including repeat confirmation.

The same test found that multi-account cleanup rewrote account labels from formatted display summaries after the account resolver had correctly preserved customization. That redundant name/institution write is removed; the existing resolver remains responsible for inferred account labels and honoring user choices.

`import-learning-loop-db-regression.ts` permanently exercises the real statement and receipt workers, a durable manual correction, the next document, older-rule retrieval beyond 500 popular rules, preserved duplicate occurrences, currencies, account balance, source evidence and repeat confirmation. The deployed verification retains its failed first run as evidence and uses a fresh Profile for the corrected release.

The live receipt replay also exposed a concurrent-upload race: receipt PDF processing attempted to download a source that was still being uploaded. Document handoffs now pass available PDF/workbook request bytes, while storage-only extraction and PDF rendering await the original upload. The real-worker regression models an unacknowledged source write and requires all expected rows, without timers or a provider fallback. Raw-file persistence still precedes financial writes.
