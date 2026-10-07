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
