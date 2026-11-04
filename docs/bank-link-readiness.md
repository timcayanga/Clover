# Bank linking: authorization through usable financial data

November 5, 2026. Applies to the Finverse Connect flow shared by web and the native API proxy. No customer reconnections, ledger repair, migration or automatic relinking is performed by this change.

## Findings and behavior

Finverse `DATA_AVAILABLE` means at least one product is available, not that transaction retrieval has completed. Clover now evaluates `login_identity.product_status` for Accounts and the reported online/historical transaction products. It waits while either transaction product is in progress, preserves partial success when one product succeeds, and reports failure when required data fails. Older responses without product statuses require a terminal retrieval summary. See the provider's [API documentation](https://docs.finverse.com/).

Local Ready is written only after selected accounts and retrieved booked transactions have been persisted. Parent/unselected accounts do not inflate the linked-account count. Empty selection cannot finish the initial setup. Subsequent sync retains the original selection without repeatedly asking about other unselected accounts. Existing identity matching, account snapshots, pending-transaction exclusions, duplicate detection, quota reservations, deletion tombstones and confirmed-edit protection remain in force.

A provider response with no accounts is an actionable failure. Linked accounts with no provider balances or visible bank-backed transactions are an explicit empty result, with Upload/Manual as alternatives; authorization and a successful HTTP response are not evidence of financial-data activation. Valid zero balances count as data. A completed bank sync can still have an empty result: `lastSyncedAt` is the retrieval completion time, not a first-value metric.

The selected institution is saved at setup. Unfinished/tokenless authorizations and failed exchanges remain visible under Finish Linking and notifications, scoped to their Profile. They can be cancelled or restarted. Failed token exchanges are not left indefinitely Authorizing. Callback replay/expiry, fixed web/native destinations and ownership checks remain enforced. Credentials and raw bank data never appear in recovery responses.

Optional full account-number lookups skip numbers already provided and run in groups of at most three, rather than a sequential waterfall. Bank/provider retrieval itself can still take minutes. Clover does not promise a ten-second bank connection.

## Measurement

`bank_link_stage` and matching durable `AuditLog` actions `bank_link.<stage>` record each connection's first observed Started, Authorized, Selection Required, Data Available, Empty Result, Failed and Cancelled milestones. Counts, opaque connection/Profile IDs and elapsed milliseconds are recorded; names, account numbers, balances, transaction contents and tokens are not sent to analytics. Repeated polls/syncs do not create duplicate milestones. Analytics failure cannot cause a bank operation to fail.

Use Started connections as the funnel denominator, Data Available as first usable bank-backed data, and report Empty Result/Failed/Cancelled separately. A connection may fail then recover; these milestones are not mutually exclusive final outcomes. Timing is connection creation to server-observed data availability, including user authorization/selection time. It is not browser-render latency, provider-only duration or a per-refresh first-attempt success rate. Starts that fail before a connection is saved still need request-error monitoring. Historical connections are not backfilled or marked successful.

## Verification

`qa:finverse` covers product readiness, scoped account selection, callback replay, expiry, native/web destinations, cancellation, safe projections, allowance/retention and persistence contracts. `finverse-bank-journey-db-regression.ts`, registered in the disposable PostgreSQL release gate, runs the actual link, callback, connections and sync handlers against synthetic provider responses and real Prisma persistence. It exercises:

- Free refusal before bank authorization, verified paid-user setup and institution naming.
- Interrupted authorization visibility/reconnect response; POST callback and native exchange failure.
- Delayed transaction products, provider failure, empty accounts and empty selection.
- Explicit selection, visible Accounts/Home balance projection, booked transaction persistence and repeated sync.
- Partial results and empty financial results without false Data Available milestones.
- Cross-Profile refusal and byte-for-byte preservation of existing confirmed transaction/account fields.

No real bank credentials, OTPs, external consent or customer financial data are used. This proves Clover's tested provider contract, not live availability of every institution. The legacy Lunch Flow provider is outside this Finverse correction; its existing integration regression is retained. Live-bank acceptance still needs a consenting owner to complete their bank's authorization and verify the resulting accounts/transactions. Source changes to native status copy require a future app build; server readiness, recovery listings and response corrections apply through the existing API.
