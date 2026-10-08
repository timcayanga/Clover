# Home navigation performance

## Behavior

- Native Home can display the same session's latest authorized overview and details for up to 30 minutes while requesting fresh data on each focus. Other page caches keep their five-minute limit.
- Snapshot keys include Profile, currency and section. Snapshots from the previous local calendar day are not reused. Changing Profile or currency never paints the previous scope's balances while its effect starts.
- Financial writes, completed-import refreshes, logout, authorization failures and bootstrap access changes continue to clear the presentation cache. Older in-flight responses cannot repopulate a cleared cache.
- A temporary overview refresh failure shows its notice above the existing content. Authorization failure hides the content.
- Cold launch still uses the existing encrypted, authorized five-minute disk hydration policy. No additional persistent storage or server financial cache was introduced.
- Browser Home now loads bank snapshots, payment suggestions, review counts, commitments and compatibility checks alongside primary account/transaction reads instead of waiting for totals and FX first. Calculations and currency rules are unchanged.

## Verification

- `node --experimental-strip-types mobile/scripts/native-navigation-check.mjs`: bounded Home retention, slow refresh, network failure, mutation invalidation, Profile/currency isolation and day rollover, plus existing cache race tests.
- `node web/scripts/home-cache-browser-regression.cjs` with `playwright-core` on `NODE_PATH`: bundles the actual native Home React component with DOM adapters and synthetic session responses. Cached content remains rendered during a 2.1-second response delay, then updates; checks refresh failure, mutation invalidation, Profile change and revoked access. This is render behavior coverage, not a physical-device latency measurement.
- Native/web TypeScript checks and the existing critical-page-loading regression.
- Full `npm run qa:prepush` is required before staging push.

Native changes require a new iOS/Android binary. Browser read scheduling takes effect with the staging web deployment. Initial uncached loads and loads after financial invalidation still depend on network/server response time; no sub-second device timing is claimed.
