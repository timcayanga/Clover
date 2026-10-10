# Staging learning verification

This is an explicitly invoked live diagnostic, not an unattended release job. It uses the existing dedicated staging QA identity, ordinary authenticated upload/edit APIs, and an operator-only verification endpoint. No schema migration or parser/rule rewrite is involved.

The endpoint requires all three markers (`VERCEL_ENV=preview`, `CLOVER_DEPLOYMENT_ENVIRONMENT=staging`, and the `staging` Git branch), admin operate access, and a trusted request origin. It returns 404 outside staging. It allocates a new Profile under the fixed existing QA account and binds the run to its initiating admin in an audit record. It accepts no arbitrary Profile, user, transaction, source, or job payload. Existing Profiles are never reset, reparsed, or deleted.

Before the Profile is created, a repeatable-read snapshot records counts and SHA-256 digests of complete rows in 21 financial, source, learning, and job tables. Subsequent comparisons exclude only this run's new Profile. Changes by another session are reported, not reverted or silently accepted. Source bytes for each uploaded fixture are separately downloaded and checked against their SHA-256. The manifest is preservation evidence, not a replacement for the sealed restorable knowledge backup.

The live driver uses `repeated-and-multicurrency.csv` and `receipt-php-items.txt` from the reviewed regression corpus. The first statement upload is byte-identical. The receipt text is rendered into a supported PDF, with extracted text checked against the source and both pages visually reviewed. Follow-up copies change only the explicitly documented date to represent subsequent purchases; both original and derivative hashes are retained. These are synthetic reviewed source documents, not newly trained real customer documents, nor an OCR accuracy benchmark. The normal upload, persistence, manual correction, durable outbox, later retrieval, repeated-transaction and source-download paths are exercised through deployed authenticated HTTP APIs.

After the ordinary flow, `prepare-checkpoints` saves another financial manifest and creates two small synthetic learning batches exclusively in the test Profile. One stops after its first item because the next category reference does not yet exist. `repair-reference` creates that missing fixture category without changing the job input; retry uses the existing admin Learning jobs API/UI. The second simulates a stopped worker using an expired lease after one committed item. This tests deployed recovery from that state; it is not a claim that a Vercel process was physically killed. Existing workers and their leases are never interrupted. Test data and attempts are retained for review.

Example (provide an existing development Clerk credential file; its database/provider values are deliberately ignored):

```sh
node web/scripts/staging-learning-verification.mjs --execute --phase=start --sha=FULL_STAGING_SHA --env=/private/staging.env --output=/private/verification
```

Use the same arguments and output directory for `loop`, `prepare-checkpoints`, `inspect`, `repair-reference`, `retry`, and `finish`. Prepare `inputs/receipt-first.pdf`, `inputs/receipt-later.pdf`, and `inputs/manifest.json` in the output folder before `loop`; the manifest pins each PDF's `name`, `sha256`, reviewed `sourceTextSha256`, `dateChanged`, and `extractedTextVerified`. Inspect the failed and interrupted jobs in `/admin/data-qa/learning` before repair/resume. The final phase retries completed jobs and compares financial, rule, signal, template, and source records again. Every invocation checks the exact deployed SHA and revokes its temporary Clerk sessions. Credentials and tokens are never saved in the report.

`staging-learning-verification-db-regression.ts` is part of the permanent release gate. It tests deployment guards, operator/origin checks, fixed ownership, retryable start, fault/recovery behavior, unchanged rows, and detection of an independently changed historical rule. It runs only against the release gate's fresh local PostgreSQL instance.
