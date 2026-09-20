# Native functionality expansion

Scope: native Upload, Circles invitations/resources, and investment assets/trading on iOS and Android. Admin is excluded.

## Changes

- Upload: authenticated 1.5 MiB parts, 25 MiB file cap, server acknowledgement of completed parts, encrypted offline retention until handoff, pause/resume/cancel before finalization. Completion assembles and verifies all parts before using the existing parser, quotas, source storage, duplicate checks, and review workflow. Ordinary web multipart requests retain their existing size limit.
- Temporary transport storage: ten unfinished sessions per user, 100 starts per 24 hours, 24-hour expiry; cleanup is attached to import recovery. Local queue is limited to 50 MiB. Cancel removes only temporary upload data, never a received import or confirmed transactions.
- Circles: incoming invitation review/acceptance, organizer send/resend/revoke screens, member/goal contribution assignment, commitment assignment/recurrence/date/notes, summary/detail visibility. Acceptance claims an unchanged, unexpired invitation atomically. Existing server membership authorization remains authoritative.
- Investments: explicit user-reviewed opening positions per asset/account/currency; editable asset metadata and dated valuations; per-position trading; paired internal transfers and paired reversals. Imported snapshots stay intact. Positions are projected into native and web portfolio readers. Existing account-level trades remain separate.
- No brokerage execution or money movement is added.

## Validation completed

- Mobile TypeScript check.
- Web TypeScript check, including final integrated tree.
- Expo production bundles for iOS and Android.
- Offline regression suite: 26/26, including byte-exact part resume, pause/retention, finalization cancellation protection, and continuing other queued files when one is paused.
- Mobile API regression suite.
- Prisma schema validation.
- Disposable PostgreSQL database at `127.0.0.1:56545/clover_native_expansion`: multi-asset isolation, paired transfer atomicity/reversal, overselling, opening-date guards, ownership, duplicate retries, imported-source preservation, position valuation history, upload part size/hash checks, cancellation, expiration cleanup, >4 MiB parser handoff and cached canonical acknowledgement.

## Staging release and live checks

- Full `qa:prepush` passed on `bb0ed0a425566e4a10e8db799a9964cc29293bdf`, including production Next build, both Expo bundles, and release regressions. Pushed to staging; Vercel deployment `dpl_95bEyKNbNRM8jwszPAUUUXCDN2YG` reached READY and received staging.clover.ph.
- Authenticated staging QA reads passed for bootstrap, Circle invitations, investment positions, and investments. The temporary test session was revoked.
- Deployed transport smoke passed: a 5 MiB disposable upload session accepted a 1.5 MiB part, accepted an identical retry, and returned the persisted part when resumed. Cancellation succeeded and removed the temporary bytes. No import was finalized and no financial records were changed.
- Browser/server file-validation boundaries were verified separately: ordinary browser multipart remains limited to 4 MiB; the larger limit applies only to verified native finalization.

## Remaining installed-device verification

- iOS reached its Home screen, but computer-control actions intermittently failed or had no effect. Alternative simctl UI control was requested; approval is still pending. No authenticated native flow is recorded as passed.
- Android cold boot remained on the Google boot screen for several minutes under host resource pressure. The Clover package was listed, but its activity was not yet resolvable. The emulator was stopped to release resources for the concurrent staging release checks.
- Metro was stopped. Resume device verification with one simulator/emulator at a time and an authenticated native QA session. Exercise upload pause/resume/cancel, Circle invitation/assignment controls, and asset edits/trades/paired transfers.

This record distinguishes compilation/database checks from installed-device verification; it is not a claim that all native runtime paths have passed.
