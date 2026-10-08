# Mobile row deletion

Swipe left reveals Delete. Tapping Delete reveals confirmation and Cancel within the same row. Swiping alone never deletes anything. A failed request keeps the row and shows an inline error; repeat taps while pending send one request.

Covered lists:
- Transactions, including transactions in account history.
- Accounts, including individual investment accounts inside an institution.
- Investment assets, including holdings inside institutions.
- Recurring schedules and native calendar occurrences.
- Split bills, including group/person bill lists.

Institution summary rows are not bulk-delete controls. Account deletion confirmation states that linked transactions are also removed. Recurring deletion keeps existing transactions. Investment deletion targets either the actual account or the individual holding/position; it never substitutes an institution account for a holding ID. Tracked positions with active paired transfers require those transfers to be removed first. Position confirmation explains that trading and valuation history is deleted. Raw imports remain unchanged.

## Verification

- `npm --prefix web run qa:mobile-swipe-delete`: application component gesture/confirmation handlers on web and native, cancellation, duplicate taps, failure/retry, mutation authorization/origin/asset scope, API method policy, and JSX wiring.
- `node web/scripts/swipe-delete-browser-regression.cjs`: real React component and application CSS in headless Chromium, touch gestures and keyboard action, widths 320/390/768/1024/1280, synthetic API failure/retry. Requires `playwright-core` and `esbuild` on the Node module path; `QA_BROWSER_PATH` can select a Chromium executable. Screenshots default to `/tmp/clover-swipe-delete`.
- `npm run qa:prepush`: repository-wide security, regression, TypeScript, native bundle and web production build checks.

No real user records are deleted by these tests. Native gesture callbacks and compiled bundles are tested; physical iOS/Android validation remains a device release check. Installed apps need new binaries to receive the native UI change. Mobile web receives it through the web deployment.
