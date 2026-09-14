# Clover smoke run — September 14, 2026

**Incomplete: 40 total = 2 Pass + 3 Fail + 35 Blocked + 0 Not run.** Three unique defects identified. Blocked means the required fixture/platform is unavailable; it does not mean the case was executed successfully. Failed grouped cases also have unexecuted assertions, listed in the results CSV.

This is the first execution of the fresh suite. No earlier QA results were inherited. No application fixes, migrations, or deployments were performed during this run.

## Environment and evidence

- Live staging: https://staging.clover.ph
- Verified deployment: `dpl_3m2WcoWM2njsWZDvFygRH9unxWnP`, READY, commit `63971985de5c7907b5c6cb742c0efcaa5ed68ac1`.
- Desktop: Chrome 153, 1440×900; mobile-web onboarding probe: 390×844.
- iOS build 2 and Android versionCode 3 are available for commit 63971985. Neither current build was exercised as an installed native app in this run. Installed simulators/emulator tooling alone is not device-test evidence.
- One disposable account was registered in Clerk development using its reserved test-email pattern. Clerk's supported testing token was used for automation bot detection; actual Clover requests used the resulting real development session. No real mailbox delivery was required.
- Existing local database credentials were found to target production. The only direct database operation against that configuration was a read of the deployment-environment marker. No production records were changed. Vercel's staging env export omits sensitive database URL values, so direct fixture seeding was not available.
- Public-page evidence, error screenshots, authenticated probes and Vercel runtime errors are under `qa-evidence/2026-09-14-smoke/`. Fake QA identity details may appear; no passwords/tokens are included.

## Results with executable checks

| Case | Result | Evidence summary |
| --- | --- | --- |
| C01 Public pages | Pass | Landing, Features index, six linked feature pages, Pricing, Privacy and Terms: 11 routes returned 200. Images loaded, no desktop horizontal overflow; pricing currency/period visible; signup CTA reached signup. |
| C02 Authentication | Pass | Invalid-password message verified. Correct-password sign-in works; Settings survives refresh with QA identity. Logout then protected Settings redirects to Sign In. |
| C03 Onboarding | Fail | Signup creates QA identity and Plan shows Free, but onboarding crashes before prompts. Home/Accounts/Transactions redirect to the same failing onboarding page. |
| C23 Notifications/help | Fail | Help/Contact render; Referrals independently crashes due to missing Clerk middleware coverage. Notification fixture assertions remain unavailable. |
| C24 Plan | Fail | Public Pricing and authenticated Plan disagree on Profile limits: 1/5 versus 3/10 for Free/Pro. QA remains Free. No purchase completed; full regional checkout/cancel check remains incomplete. |

Additional partial checks do not count as passes: Settings theme and helper-text preferences persist after reload and were restored to Light/Shown. Account/Security/Region/Data render. Profile/category-dependent Settings cannot load the needed workspace data; Vercel confirms the same missing-table error. Mobile web reproduces the onboarding error. Ordinary QA account did not expose Admin content.

## Defects

### SMOKE-001 — Blocking: staging schema prevents onboarding

Reproduce: register a development QA user → complete Clerk signup → open `/onboarding`. The error page shows reference `CLV-1WTZJU0`. Reload, `/home`, `/accounts` and `/transactions` do not recover.

Vercel logs: Prisma `P2021`, `public.BrankasStatementSession` does not exist, during `prisma.workspace.findMany()`. Settings logs report the same failure when loading workspaces. The schema declares this model, but a text search of the tracked migration SQL found no Brankas table creation. This is an application/database-schema issue; the observed error is not an egress-quota rejection.

Impact: cannot complete onboarding or prepare the golden Profile through the normal flow. Most financial feature cases are blocked before their actions can be exercised.

Suggested repair: reconcile tracked migrations with the deployed Prisma schema, review additive SQL against staging, apply through the established deployment process, and retest signup plus existing-user workspace loading. Do not reset a database or drop financial tables.

### SMOKE-002 — Plan-limit inconsistency

Reproduce: compare public `/pricing` with authenticated `/settings/plan`. Public table says Free 1 Profile / Pro 5; Account Plan says Free 3 / Pro 10. The current user-management specification also describes 3/10. Public wording labels the table as planned limits, but does not explain the conflicting Profile allowance in Account Plan.

Suggested repair: use the approved Profile allowance consistently or explicitly describe a deliberate future-policy difference. Currency differences before onboarding are not counted as an additional defect in this run.

### SMOKE-003 — Referrals route crashes

Reproduce: authenticated QA user opens `/referrals`. An error page appears. Vercel logs identify `auth()` called without detected `clerkMiddleware()` and point to `/referrals`.

Suggested repair: inspect middleware matching for this route and verify signed-in access plus signed-out redirect after correction.

## Resume conditions

1. Repair SMOKE-001 and retest C03. A scope question asking whether to fix staging and continue has been sent; no repair was applied while awaiting the answer.
2. Reuse the existing QA identity/session, prepare the golden and scratch fixtures once, then execute all blocked desktop/mobile-web rows.
3. Prepare disposable Owner/Read-only sessions for C25–C27; do not impersonate a real administrator just to get a passing result.
4. Install the current staging native builds on accessible test devices or prepare equivalent current emulator/simulator builds and label that coverage explicitly before C33–C40.
5. Retest affected rows after fixes, preserving these initial failures and their evidence. Keep the denominator at 40.

Browser session `clover-smoke-20260914` was retained for continuation. Private credentials and a saved auth state are in the local `/tmp/clover-smoke-20260914/` directory with restricted file permissions; do not commit or share them.

Clerk test-auth reference: https://clerk.com/docs/guides/development/testing/test-emails-and-phones and https://clerk.com/docs/guides/development/testing/overview.
