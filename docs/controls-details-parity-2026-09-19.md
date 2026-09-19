# Controls and details parity — 19 September 2026

This pass implements the controls/detail findings from the September 19 audit in staging code.

## Changes

- Reports: centered responsive filter dialog with Profile, period/custom dates, comparison period, accounts, currency, categories, transfers and review status. Changes apply together; Reset retains the current report tab. Keyboard focus stays inside the open dialog and returns to the trigger on close.
- Report transaction filters combine before aggregation. Edited/confirmed rows are explicitly labeled together; pending review excludes rejected and skipped duplicates. Category names containing commas round-trip correctly. Same-date-last-year comparison clamps leap day to February 28.
- Account selection also scopes balance/net-worth charts. Category/review/transfer filters do not rewrite balance history; the dialog explains that balances retain every movement of the selected accounts. Transfers never become income or expenses.
- Recurring: all four type tabs use the existing month/year calendar, including event names, amounts and detail entry points. The separate list filter is labeled as a list date range.
- Transactions: filter sections reuse the detail icons, warnings retain a bare triangle, and mobile transaction metadata includes the date.
- Split Bills: manual entry includes an editable date, resets to today's local date when reopened, validates it and submits the selected date.
- Upload: remove redundant introductory copy from the mobile three-choice selector, including the native Add screen.
- Mobile Accounts: collapsed rows use the same institution logo/fallback component as expanded cards; remove the Account tools disclosure; avoid repeating identical card labels and allow long names to wrap around a fixed-size logo and amount.

## Already present / boundaries

- Budget detail Transactions tab icons and the detail-page Delete Goal action already exist.
- Native Recurring already exposes month navigation; native Split Bills already has a validated editable date. Native Reports date/comparison controls were implemented in the preceding functionality pass. The expanded Reports filter dialog in this pass is desktop/mobile web, not a claim of identical native multi-account/category/review filters.
- Asset Details' remaining web Add Trade integration and the audit's financial-total discrepancies are not represented as closed by these control fixes.
- No existing financial records are rewritten by this pass.
