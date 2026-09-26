# Home currency and mobile refresh

## Behavior

- Home starts in the Profile currency. Its globe selector sits beside Menu on mobile; desktop places the selector before Add Transaction and Adviser beside Home.
- A specific currency filters Home balances, income/expenses, reports, budgets, recurring payments, suggestions and transaction review counts.
- All Currencies converts the combined balance and income/expenses to the Profile currency. Reports remain separated; budgets and scheduled payments retain their own currency labels. Missing exchange rates remain unavailable rather than becoming zero.
- Currency selection changes presentation only. No financial records or Profile currency preferences are changed.
- Relevant mobile directory/report screens refresh on a downward pull at the top. Native Home, Accounts, Recurring and shared plan screens await their focused data loaders; Transactions retains its existing FlatList refresh. Web refresh waits for the server transition and registered client loaders, including market charts, Circles and budget history.
- Current tabs, filters and currencies remain selected. Creation/edit routes and modal sheets do not refresh.
- Generic account icons use the exported Figma type palette across canonical web assets and bundled native assets. Institution logos are unchanged.

## Design source

Figma file `FNnCmCj90szZAnZ6twMPCy`: Home light/dark headers, currency/refresh behavior notes, account icon sheet `1166:51839`, and account screen examples. Canonical SVG exports are retained beside PNGs in `assets/account-types`.

## Automated checks

`web/scripts/home-currency-refresh-regression.ts` verifies single-currency isolation, All conversion, missing-rate behavior, source preservation, waiting for slow refresh loaders, failure settlement, route isolation and listener cleanup. Included in the full pre-push quality gate.

Native delivery is a local iOS simulator application and Android emulator APK; this task does not submit store/EAS builds or deploy production.
