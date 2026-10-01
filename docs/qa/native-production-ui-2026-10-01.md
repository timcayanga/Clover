# Native production UI repairs — 1 October 2026

Scope: iOS and Android production screenshot findings, implemented for staging. No production records were changed.

## Repairs

- Native API supplies a primary built-in bank logo even when a brand originally specified only fallback candidates (BPI, Maya and others). Native image rendering also accepts bounded PNG/JPEG/WebP custom data images.
- Accounts and Investments show totals of known values, with explicit incomplete-data coverage, instead of blanking the entire total when one account/holding has no valuation. Unknown balances remain unknown. Accounts supports All Currencies with separate currency totals and avoids repeating an existing account-number suffix.
- Reports retain a stable cohort of accounts with known balances. Money history uses recorded movements and known current balances; when complete dated net-worth checkpoints are unavailable, the UI displays an explicitly labelled estimate. Finverse liabilities use shared balance-sign normalization. No reconciliation records are written.
- Cash flow uses proportional closed bands and separate cumulative source/target intervals. Each account height equals the larger inflow or outflow. One-way and zero-flow cases are supported.
- Transactions separates initial loading, pagination and pull refresh. Pull refresh preserves existing rows and uses its own single indicator.
- Recurring overview uses All Recurring rows with type, account/status and amount.
- Reports and Investments use expandable filter rows. Asset types use title case. Home omits the redundant currency scope sentence.
- Upcoming rows can grow with text size; shared tabs use fewer columns when labels/font scale need room. Premium text/icons use Clover green in light mode and mint in dark mode.
- Account profile header is compact and has no close X. Plan token meters display percentages. Plan carousel measures card content, locks direction and disables bounce/vertical inset expansion.

## Figma

Updated editable existing components/screens before implementation:

- [Account](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1775-526190)
- [Plan](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=682-93146)
- [Cash flow](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=572-28988)
- [All Recurring](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1901-101056)
- [Investment filter rows](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=935-81098)

Also adapted the Home upcoming-payment component to growing rows. Existing Reports filter, brand-logo and populated summary designs were already consistent with the intended behavior. Mobile canvases retain bottom navigation and expose complete content.

## Verification

- Full root npm run qa:prepush passed, including production dependency audits, regressions, native typecheck/chart checks, and production web build.
- Regression coverage: partial/unknown balances, source data preservation, currency/Profile separation, primary-logo files, partial holdings, token percentages and nonoverlapping proportional flow segments, including more than five accounts and extreme imbalances.
- Compiled native React Native Web sample preview checked at 393px and 320px. Accounts totals and All Currencies, Reports charts and dropdown rows, investment estimate and title-cased choices, compact profile header, and Plan carousel content bounds inspected. Carousel scrollHeight equalled clientHeight (394px) while retaining horizontal overflow.
- Figma screenshots inspected for the revised screens.

The sample preview is not an on-device iOS/Android test. Font scaling, pull-refresh gestures and iOS carousel bounce require the next installed native binary for final physical-device verification. The temporary local sample-preview build did not change the committed startup/demo setting. Staging web/API deployment alone does not replace installed native app code.
