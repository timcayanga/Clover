# Platform parity pass: native balances and mobile controls

Baseline: `c5a204e9`. Figma Screens file `FNnCmCj90szZAnZ6twMPCy`.
References read: Reports mobile `1243:507886`; Adviser conversation mobile `1243:506564`.

## Changes

- Native Reports uses the same `reportAccountBalance` and `buildReportBalanceSeries` calculations as web for Money over time. The existing authenticated mobile endpoint now returns separate 7/30-day balance series in the requested currency and authorized Profile. Native continues to use its existing Asia/Manila reporting windows. Missing balances remain unavailable; no zero history is invented. Financial records are not changed.
- Added the current tracked balance, explanation and balance/spending navigation to the native chart. Older responses without balance data show an unavailable chart instead of mislabelling income/spending as account balances.
- Native report tabs have a compact 40px variant. Mobile web tabs now receive the same horizontal, rounded-top treatment inside their actual shell location.
- Shared native Adviser icons use the enlarged Figma crop; planning-page header icons use the specified size.
- Native Adviser renders the existing server-provided follow-up prompts and transaction-count/date metadata. Only those two grounding fields are exposed by the mobile response projection. Suggestions fill the composer and do not auto-submit. Local replies clear cloud follow-ups.
- Shared native-component browser previews adapt long summary values to available width instead of ellipsizing financial amounts.

## Evidence

- Authenticated staging desktop Reports and 390px mobile web Overview visually inspected. Mobile shell tab mismatch found and corrected in source.
- Native RN-web sample preview inspected at 390px and 320px. Final 320px cards show full amounts; all four report tabs are 40px; document scroll width equals viewport width. Switching to the 7-day filter updates the labelled balance series. Bottom navigation remains visible.
- Isolated mobile web stylesheet fixture at 320px verifies horizontal 40px tabs, 8px upper corners, 11px labels and no page overflow. This does not replace authenticated post-deployment inspection.
- Regression checks cover manual opening balances, net-neutral transfers, Manila midnight boundaries, 7/30-day windows, currency/Profile query scope, empty/unknown balances, no input mutation, and Adviser response-field minimization.
- Full root `qa:prepush` includes native TypeScript and iOS/Android exports, web regressions and production build; the push hook repeats this gate.

## Remaining limits

Persistent Adviser chat history and embedded report cards still need implementation. Native custom date/account/category filters and all detailed Figma states are not certified by this pass. Native exports and an RN-web preview do not prove installed-device layout, keyboard or safe-area behavior, and do not distribute a new native binary.
