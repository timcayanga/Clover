# Circles and Budgeting loading audit — September 3, 2026

## Scope

Reduce work required to display the two card directories, without changing saved financial data, permission boundaries, budget totals, or Circle expense de-duplication. No shared cache of private user data was introduced.

## Findings and changes

- Circles previously loaded the full graph for every accessible Circle: memberships, invitations, activity, budgets, goals and their contributions, commitments, investments, expenses, plus personal transaction/investment pickers. The initial page now selects only card identity, role, active member count and amount/date data. Opening a card loads only that Circle's detail graph. Mutations refresh the selected Circle, not every Circle. Deletion refreshes the directory.
- The directory and detail queries retain the same owner/active-member and non-archived filters. Expense ordering, limits (100 shared transactions / 100 split bills), deleted/excluded filtering, shared-amount overrides and split-bill de-duplication remain unchanged. These pre-existing limits were not expanded into an unbounded ledger scan during this performance change.
- Circles page authentication/onboarding now shares one session and user resolution rather than repeating them.
- Budgeting previously fetched 400 days of transactions, account/category editor options, suggestions and legacy plan metadata before rendering. Directory mode reads only the earliest current budget period (including paused budgets), plus the current month for the uncategorized warning. Annual and cross-year weekly periods remain supported.
- Budget editor options now load on opening the editor; legacy plan metadata and suggestions are omitted from the directory path. Existing Adviser, notification and mutation consumers retain the full loader behavior.
- An empty Budgeting directory reads budgets only. A normal nonempty directory uses three loader reads instead of six. After the budgets query, transactions and commitments load together, staying within the two-connection pool. These are Prisma calls, not a claim about the number of SQL statements emitted for included relations.
- Parsed-row fallback remains available during import normalization. An existence check prevents the narrower period from resurrecting parsed rows when older normalized transactions would have suppressed the previous fallback.
- Pending details/options display loading states; failures have retry controls. Stale requests are aborted. Editing controls cannot save incomplete option data.

## Verification

`npm run qa:budgeting` includes the new `collection-loading-regression.ts` real-loader/mock-database suite. It compares complete BudgetOverview output across daily, weekly, biweekly, monthly, quarterly and annual cadences, including paused budgets, year boundaries and leap day. It also checks fallback behavior, empty directories, Circle totals/de-duplication, access query scopes and a maximum of two simultaneous reads.

In the deterministic 4,000-transaction monthly fixture at September 3, the directory loaded 30 relevant transactions instead of 4,000 (99.25% fewer), with identical overview results. This is workload reduction, not a measured 99.25% page-speed improvement.

### Browser baseline

Staging baseline: `dpl_DknhuaspPSCJWvD1Mz5p8a3E2SSe`.
Same warm Chrome session, small existing QA profile, three reload-to-visible-card checks per page:

| Page | Samples (ms) | Median (ms) |
| --- | --- | --- |
| Budgeting | 377, 433, 537 | 433 |
| Circles | 843, 916, 348 | 843 |

Measured with the browser automation clock, including tool overhead. These small warm samples are not real-user p75/p95, cold-start, throttled mobile-network or large-account benchmarks. Larger accounts should benefit most from reduced data loading; live timings remain sensitive to network and server cold starts.

### Post-deployment browser results

Same session and measurement method after deployment:

| Page | Samples (ms) | Median (ms) | Baseline median (ms) |
| --- | --- | --- | --- |
| Budgeting | 481, 253, 240 | 253 | 433 |
| Circles | 623, 376, 302 | 376 | 843 |

Verified the directory → Circle details → back flow, Budget details with all six report periods/history, desktop editor options, and the full-page mobile editor. Tested 390px and 320px viewport overrides with no horizontal document overflow. Browser error logs were empty. The test browser viewport was reset afterward. No financial records were created, edited or deleted during live verification.

Full `npm run qa:prepush` passed (typecheck, complete release regression suite, optimized build); `git diff --check` passed. Existing build warnings about multiple local lockfiles and webpack cache serialization remain nonblocking.

## Deploy result

- URL: https://staging.clover.ph
- Deployment: https://clover-1y2ab5eh6-timcayangas-projects.vercel.app
- Target: preview/staging; production unchanged
- Status: READY; `/api/health` confirms `dpl_BeXfaGvAmxVwre1JCZsnFm49NMea`
- Commit: worktree snapshot on `b29962ce`, including uncommitted layout and performance fixes
- Framework: Next.js 15.5.22
- Deployment duration: approximately 3 minutes
