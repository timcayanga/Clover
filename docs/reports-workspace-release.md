# Reports workspace: October 2026 release

## Scope and access

Web and the native iOS/Android Reports screen consume the same Profile-scoped read service and platform-neutral arithmetic.

| Subtab | Free | Plus and Pro |
| --- | --- | --- |
| Overview | Income, spending, net income, savings rate, money over time, dated net worth, income sources | Same |
| Spending | Where It Went; Spending Mix as donut, bars or table; transaction drilldowns | Same |
| Trends | Spending pace, income/spending lines, separate weekly and monthly summaries, detected repeat bills, biggest merchants | Also monthly income/expense statement and category trends |
| Insights | Upgrade explanation | Cash Flow with source/account/destination controls; Main Drivers; Next Steps; Goal Check |
| Saved reports | Existing settings remain visible and deletable after downgrade | Create, open, rename/update and delete up to 50 views per Profile |

The monthly statement includes category rows, monthly totals, totals and monthly averages, net income and savings rate. Empty months remain visible; partial months are marked and included in the average. Category trends support up to six selected categories on one scale, totals, averages and comparison changes, including categories with no current spending.

## Calculation and persistence rules

- Only active normalized Transactions contribute to report arithmetic. Deleted/excluded transactions and raw parsed import candidates do not reappear through a fallback query. Reports never modify financial records.
- User-edited transaction classifications take priority over import evidence. Existing transfer/credit-card repayment rules remain presentation-only.
- Account and category filters, review state, date windows, currency and comparison settings are shared across clients. Category/review filters narrow transaction reports; balance charts retain all account movements for the selected accounts.
- Each currency has a separate report; there is no implicit currency conversion. Transfers affect balance history but never inflate income/spending. An optional transfer activity count links to the entries.
- Money over time is an estimate from known balances and movements. Net worth requires complete dated balance evidence. Missing historical evidence is not invented.
- Savings rates can be negative; zero income produces N/A. Prior-year leap days clamp to the last valid February date.
- Repeat-bill patterns are suggestions, not confirmed recurring schedules.
- SavedReport stores names and view settings, not financial snapshots. Relative ranges resolve again on opening. Ownership is checked against the selected Profile; paid writes are checked on the server. Updates/deletes require the current revision and a Profile row lock prevents races at the 50-view limit. Workspace deletion cascades to saved views. RLS is enabled; access is through the authorized server routes.

## Design

Main Screens → 02 Understand & Plan → Reports:
- [Light desktop and mobile release designs](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=2043-165454)
- [Dark equivalents](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=2044-165598)

Editable designs cover the statement, category trends, saved views and filters, with shared mobile navigation placed below the full content.

## Verification and rollout

- `qa:report-net-worth` includes shared report arithmetic and saved-report API fixtures. Tests exercise dates/timezones, empty months, comparisons, immutability, drilldowns, authorization, Profile isolation, cross-origin rejection, plan restrictions, revision conflicts and the report cap.
- Browser checks use fictional data: native components at 320, 390, 744, 1024 and 1366 px; rendered web report panels at 320, 390, 744, 1024 and 1440 px. These checks are not physical-device validation.
- Migration: `20261007000000_saved_reports`. Existing mobile `/reports` API remains available for installed binaries; new clients use `/reports/workspace` and `/reports/saved`.
- Staging deploy only in this task. Installed iOS/Android clients need a future app release to receive the native UI. No store binaries are created here.
- Release-gate maintenance: sharp 0.35.5 resolves [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w); the mobile lockfile resolves shell-quote above 1.11.0 for [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv). Expo SDK 57 packages receive the compatible patch versions required by `expo install --check`.

## Batch 2: budget comparisons, merchants, exports and completeness

- Spending now includes a searchable merchant list with current/comparison totals, changes, counts and exact merchant drilldowns. Prior-period-only merchants remain visible. Merchant and tag filters are available on all subtabs and persist in saved reports. Multiple tags match any selected tag; separate filter groups combine with AND.
- Plus/Pro budget comparisons reuse active spend-limit cadence and scope rules. Rows show monthly targets, actual spending, remaining and over-budget amounts. Partial periods and budget creation dates prorate targets by calendar day, including leap years. Current budget settings are explicitly labelled as estimates for historical periods because budget revisions are not stored. Savings targets, inactive budgets and other currencies are omitted. Overlapping budgets are never totalled together. Filters narrow actual spending, without reducing targets.
- All plans can export the reports already included in their plan. CSV and PDF contain Profile, dates/timezone, filters, separate-currency tables and completeness notes. Web uses browser Print/Save as PDF; native uses the system share sheet. CSV escapes spreadsheet formula prefixes; PDF escapes user-provided names and uses no external resources. Temporary native files are deleted after sharing.
- “About these figures” explains saved activity coverage, review/uncategorized counts, absent balances and dated-history limitations. It does not claim that first/last transaction dates prove complete coverage. Transaction filters do not change account-balance history.
- Reports-to-Transactions links now carry date, direction, review, merchant and tag selections on web and native. Exact merchant values are transported separately, preserving commas rather than treating them as multiple names.
- No financial data is changed and no database migration is needed for this batch. Older saved views default to no merchant/tag restriction.

Designs: [Light](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=2050-165754), [Dark](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy?node-id=2050-167101). Editable desktop/mobile screens cover Spending details, filters, completeness, exports and Free-plan access, using shared navigation, variables, Poppins styles and reusable report-row components.

Verification adds `report-details-regression.ts` to the release gate. It checks all budget cadences, leap-month and creation-day proration, scope/currency/plan boundaries, confirmed directions, immutable financial rows, exact merchant/tag drilldowns, older saved settings and CSV/HTML injection handling. Native browser layouts and rendered web panels were checked at five phone/tablet/desktop widths each (40 combinations); the generated two-page PDF was rendered and inspected. These checks do not substitute for physical-device export testing.
