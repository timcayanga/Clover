# Accounts Figma implementation — September 2026

Reference file: [Screens](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=146-355).

## Design references

- Accounts desktop: `50:419`; mobile overview: `50:660`.
- Account details: `52:244`, `52:266`.
- Institution details: `54:244`; shared canonical component `611:25608`.
- Asset details: `333:259`; shared canonical component `611:25242`.
- Credit card: `335:259`; wallet: `385:632`; loan: `391:833`; mortgage: `391:1706`.
- Add Account: `52:339`, `548:20618`; shared compact selector `547:19562` and prominent amount `547:19566`.

The colorful cards in the main product screens remain the reference. The separate `735:25400` enhanced-card exploration is not applied in this release.

## Changes

- Add Account puts type first, followed by a prominent, type-labeled balance and explicit currency code, account name, and expandable optional details. The established investment fields and repayment schedule controls remain available.
- Add Account and Add Another stack in the design order and require a nonblank name. Expanded desktop forms scroll; mobile retains its existing creation route and bottom navigation.
- Detail cards have the shared Figma edit icon. It activates the existing name editor; number and balance editors retain their established behavior. Keyboard events from nested controls no longer open an enclosing interactive card.
- Credit details use a bordered two-column panel beside the card on desktop and below it on mobile. Summary cards, institution metrics, type controls and footer actions use the shared responsive styling.
- View Account Reports passes the exact account ID and currency. Report queries and cache keys include the account scope while retaining workspace ownership constraints. A visible account label and View All Accounts link explain and clear that scope.

Financial records, parsers and calculation formulas are unchanged. Report scoping is a read-only query change. Figma icons reuse the previously exported InterfaceIcon assets.

## Verification

Local testing uses synthetic records in an isolated PostgreSQL database, with temporary preview routes that are removed before release.

- 75 layout checks passed: Accounts at 1440/390/320px; all 14 Add Account types at those widths; all 14 detail types at 1440/390px; Institution Details at desktop/mobile.
- Exact account-report totals passed: selected account PHP100, all fixture accounts PHP1,400, missing account PHP0.
- Edit icon activates the existing name input; Escape cancels without changing its value.
- Representative loaded detail views and form action checks are recorded in the release verification below.

Native binaries are not part of this Vercel staging deployment. Mobile checks cover responsive web layouts.

## Release verification

- Seven form control checks passed, including creating a synthetic account through Add Another, reset after save, empty-name gating, explicit currency, reachable long-form submission, mobile navigation, and close.
- Fully loaded bank, credit and investment detail views passed desktop/mobile checks; the mobile investment check passed after allowing local compilation to finish. Institution Details also passed after load.
- TypeScript passed. Temporary preview routes were removed before the release gate.

- Full `qa:prepush` gate passed: web regressions and TypeScript, mobile TypeScript/dependencies/API checks and Expo bundles, and the optimized Next.js build.
