# Asset Details parity pass — 15 September 2026

Reference: Screens Figma `FNnCmCj90szZAnZ6twMPCy`, mobile master `1244:62678` and desktop `1244:62679`.

The native app previously used the generic AccountEditor read-only body for investment holdings. The shared view now supplies the Asset Details header, asset-type squircle, identity card, subtle edit action, portfolio summary cards, and labeled holding fields. It is reused when opening investments from Accounts and Investments. The existing authenticated detail fetch, editing, cancellation, and deletion confirmation remain intact. No financial mutation behavior changed.

Unknown current values and purchase values are displayed as Not recorded; gain/loss is only shown when both are known. Optional maturity, interest, units, symbol and principal fields appear when recorded. The native API does not currently provide the canonical trading-history collection or institution aggregation, so these are not simulated with placeholder transactions.

Verification: native web preview at 390px and 320px using fictional sample holdings; edit, save, cancel and back navigation; long asset name; unknown basis and recorded principal/maturity values. Narrow identity cards place the name on its own row. Shared bottom navigation remains present. Full prepush validation includes web regression checks/build plus iOS and Android bundle exports.

This is an incremental native detail improvement, not certification of whole-app parity. Outstanding: native trading history and trade flows, institution detail aggregation, investment valuation history, and installed iOS/Android visual verification. Desktop and mobile web retain their existing richer Asset Details implementation.
