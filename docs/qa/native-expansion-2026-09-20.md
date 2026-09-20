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
- Web TypeScript check (before final integration additions; rerun required).
- Expo production bundles for iOS and Android.
- Offline regression suite: 24/24, including byte-exact part resume, pause/retention, and finalization cancellation protection.
- Mobile API regression suite.
- Prisma schema validation.
- Disposable PostgreSQL database at `127.0.0.1:56545/clover_native_expansion`: multi-asset isolation, paired transfer atomicity/reversal, overselling, opening-date guards, ownership, duplicate retries, imported-source preservation, position valuation history, upload part size/hash checks, cancellation, expiration cleanup, >4 MiB parser handoff and cached canonical acknowledgement.

## Still to complete before release

- Final integrated quality gate and staging deployment.
- Installed iOS and Android UI checks with the current bundle; authenticated flow checks after the API deployment.
- Confirm no unexpected schema/reader regressions from merging current staging.

This record distinguishes compilation/database checks from installed-device verification; it is not a claim that all native runtime paths have passed.
