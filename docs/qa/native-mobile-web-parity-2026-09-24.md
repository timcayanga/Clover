# Native parity follow-up — 24 September 2026

- Added the two missing Split Bills balance cards using the same complete authorized workspace and settlement projection as mobile web. The native list remains paginated; headline totals do not depend on its current page. The native response contains only the two formatted labels.
- Both bill mutations and screen refreshes refresh the headline totals. Loading, older-server responses and failures show a dash; errors include a retry action.
- Empty Investments portfolios show a dash instead of a misleading zero valuation.
- Regression coverage includes partial and completed settlements, payer/payee direction, mixed currencies, totals beyond one list page, existing person-name matching, minimal native payloads and unchanged source fixtures.
- Native React Native web preview checked at 320 × 568: Split Bills cards, four equal tabs, search and Filters; Investments two-row tabs, colored summaries and circular header actions. No error-level browser logs. Preview uses fictional samples; device-only appearance still requires installation of the signed builds.

Release validation and build identifiers are recorded in the task results. This pass does not modify financial records or publish to production stores.
