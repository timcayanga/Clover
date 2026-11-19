# 1.1.5 / 1.1.6 release coverage audit — 19 November 2026

Status: reconciliation branch prepared; not a claim that new native packages or web fixes have shipped. See `mobile-115-116-coverage.json`. Runtime checks stay pending until performed against the exact candidate.

## What happened

1. Web and native releases were treated too similarly. Both archived iOS packages have `EXUpdatesEnabled=false`; a Vercel deployment changes server/web code, not their embedded native UI. The 18 November discrepancy manifest explicitly records no new binaries and no simulator verification of that new source. Several subsequent requests expressly held binaries.
2. Source drift compounded this. Current deployed source `fdf611ff62603940ee2615ccf8d03af22d60e155` still contains the old native account-card implementation (identical to `8fd9eb80f`), although the archived build59 QA describes compact cards with ellipses. It also retains the old greeting, Recurring summary placement, Reports toolbar and Split Bills rows. The deployed source is therefore not a faithful recovery of all changes in the release workspace. The exact point of loss cannot be proven from the surviving commits because packages do not embed their source commit and temporary build directories are gone.
3. Release configuration was edited in temporary workspaces. Build58 logs refer to `/private/tmp/clover-category`; build59 logs refer to `/private/tmp/clover-seo-stage`. Current app config defaults to 1.1.3/build56, while archived app metadata is 1.1.5/58 and 1.1.6/59. Neither archive embeds a source commit or source fingerprint.
4. QA was too narrow to support an all-changes claim. Saved build59 QA used an account without linked banks or transactions. It covered launch/sign-in, selected header/card controls and search, not populated Recurring/Reports/Circles, bulk-edit/review, keyboard behavior, imports, payment completion or every loading state.
5. The November18 release also recorded a blocked pre-push and local-only commits. Published Git history, deployed source and store artifacts need separate verification. A prior advisory was recorded then; today's installed dependency audit reports no high or critical findings. That alone does not validate a package or replace the existing native security checks.

## Confirmed missing implementation restored in this branch

- Native account cards: compact two columns; plain top-right ellipsis; card and ellipsis both open details.
- Greeting: 1.6-second readable interval; fade-out; no replay on warm background/resume. Web receives matching lifecycle/animation behavior.
- Installed version: shared Account/auth footer.
- Recurring: full-width summary below calendar; due-date evidence in rows; omit Active.
- Reports: remove overview clutter; export selector/Download in filters; tighter native filter layout and mobile web overview.
- Split Bills: 44px pill search; consistent row type/spacing; up to five overlapping avatars beside date; own identity resolves from signed-in user; hide Open.
- Circle currency: remove decorative down chevron.
- Include the previously separate, read-only bank-statement completeness verifier. It does not modify transactions or balances and does not establish accuracy for periods without statements.

The November18 source fixes for fixed-height subtabs, chat docking, filter icons, explicit bulk edit, selected Add icons and upload history are already included in the baseline. They still require new native packages and exact-package QA.

## Prevention

`npm run release:prepare -- VERSION BUILD https://clover.ph` in `mobile/` freezes a clean committed native/shared snapshot. Both store packages derive their version/build from that stamp and embed its commit, content fingerprint and API URL in Expo extras. Missing stamps, changed sources, stale commits and wrong environments stop store configuration. EAS uses local explicit versioning with automatic increments disabled, so the two platforms cannot silently diverge from the frozen version/build. The existing root `.easignore` explicitly includes the generated stamp. Development previews retain their existing behavior. This does not enable OTA updates.

For CLI web deployments set `CLOVER_BUILD_SOURCE_SHA` to the actual full commit, at build and runtime. `/api/health` now accepts that fallback rather than returning an empty source SHA. Do not substitute metadata for a read-back of the served deployment.

`node tools/release/verify-coverage.mjs EVIDENCE.json` refuses to call a release covered without the same source on staging/production, matching iOS/Android versions and native source fingerprints, exact artifact hashes, embedded-provenance inspection and per-surface runtime evidence bound to those hashes. Web checks are separate. Store submission, review and public availability remain separate outcomes.

## Required before saying everything is covered

- Commit the reconciled source, build/verify a staging candidate, then verify the matching production deployment. Current live staging and production remain the earlier fdf611ff6 release.
- Freeze a native version/build after checking the next available store numbers. Build both packages from that one source. No replacement binaries were made during this audit while the user's release-scope choice is pending.
- Run representative populated-profile tests on iOS and Android: cold sign-in, warm resume, Accounts/Recurring from both entry points; loading/loaded tabs; filters and bulk-edit; Add/Ask keyboard; manual line items; receipts/PDF first-visible rows; bank resume/usable data; checkout preparation/recovery. Avoid financial writes to personal Profiles.
- Verify public store version/build against the actual uploaded artifacts; do not treat an upload or review submission as availability. Apple public lookup on 19 November still reports 1.1.6. Google current public status has not been reverified here.
- Reconcile Figma against the frozen release candidate. Current Figma capture work uses installed1.1.6, so it must not serve as proof that later source-only corrections shipped.

## Evidence

Private local evidence: `/Users/TimCayanga1/Documents/Clover/QA/2026-11-19-release-coverage/` (live health snapshots, archived-package hashes/config inspection, 187 historical request summaries, 33 coverage groups, test and audit logs). Earlier November18 manifest: `QA/2026-11-18-mobile-116-discrepancies/release.json`.

No confirmed financial transactions or balances were changed by this audit.

Build configuration references: [Expo version management](https://docs.expo.dev/build-reference/app-versions/) and [EAS upload exclusions](https://docs.expo.dev/build-reference/easignore/).

## Additional release-gate findings

The broader pre-push gate reproduced a peso-prefixed restaurant-bill defect already present in production source: settlement parsing refused `P374.00`, while the standalone service-charge guard skipped `P34.00` and selected `10%`. The narrow correction recognizes that printed peso prefix and excludes rate tokens from monetary summary amounts. Tests retain malformed totals, mixed currencies and arithmetic conflicts as unresolved. This changes draft extraction, not confirmed financial records.

The empty-import concurrency regression also wrapped every Prisma raw call in an async promise. That removes transaction binding for unrelated transaction writes and creates a test-only row-lock timeout. Its spy now delays only the intended cosmetic progress write at the PostgreSQL pool boundary, preserving Prisma transaction binding; all original terminal-state, no-network and confirmed-record snapshot assertions remain.

Mobile web Reports now removes tabs/date overhead while its filter panel is open, retains at least 44px filter row targets and gives export its own full row. The greeting ignores transient Clerk loading when deciding whether a user has logged out.

`python3 tools/release/inspect-package.py ARTIFACT --commit FULL_SHA --api https://clover.ph --output INSPECTION.json` reads embedded source metadata directly from the IPA/AAB and hashes the exact artifact. The final coverage gate consumes that inspection file. Android app-config metadata is labeled separately from native manifest/version validation; the installed-version check is still required. The archived1.1.6 AAB correctly fails the new provenance check because it predates the stamp. No new packages were generated for this inspection.

## Git publication gap

Read-only `git ls-remote` on 19 November confirmed GitHub `main` at `9396824a4bd50f70b320617a441d5658240a028c` (4 May) and `staging` at `f6e899dc0ad087a898e5931857237a48417161d7` (14 November). The live November deployment lineage starts at orphan snapshot `7ed9249f0`, with no common ancestor with those refs. The repository workflow uses staging as its shared development branch, so main’s age alone is not a defect. The unpublished staging changes and unrelated deployed snapshot are the publication gap. The reconciliation reconnects the validated release tree with staging history; file-tree equality is checked at that history merge. Publication uses a normal fast-forward push to staging, never a force update or a remote temporary branch.

Further independent regressions found that the photo-total guard, field-evidence checker and invoice classifier did not share the parser's verified column reading order. They could discard a correctly reconstructed total or payment evidence; an expiry date could also appear as a priced item. The correction reuses the existing conservative column reconstruction, preserves raw evidence and suggested-currency status, and excludes dated permit-expiry lines from itemization. Conflicting cash/total columns and clipped cents remain unresolved. The real worker test retains byte-identical confirmed-record snapshots and adds pending/incomplete/unpaid counterexamples.

The local broad test run also hit a resource-related Adviser timeout while other source checks were running. The Adviser case passed in isolation; release checks are being run sequentially on the supported Node24 toolchain. A timed-out run is not counted as a pass.
