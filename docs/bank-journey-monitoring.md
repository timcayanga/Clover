# Bank journey monitoring

The admin monitor is `/admin/banks`; its read-only JSON endpoint is `/api/admin/finverse/journeys`. Both require Clover admin access. It covers every institution with a stored connection automatically, not a hardcoded bank list. Customers are the default audience; staff/test evidence is opt-in. Dates are Manila calendar days. Queries are bounded and aggregate reports are cached for 60 seconds. No financial records are changed.

PostHog dashboard: https://us.posthog.com/project/388373/dashboard/2372850

## Contract

`bank_journey_stage` schema version 1 carries public bank ID/name, connection ID, durable attempt ID, operation ID, stage, outcome, observed timestamp, elapsed journey time, measured duration/boundary when available, safe structured error code/category and counts. It excludes provider bodies, credentials, MFA codes, account numbers, balances, merchant names and transaction descriptions. Existing analytics attaches environment, audience and authenticated request platform/version. No raw error messages are sent by this instrumentation.

Initial linking uses the connection ID as the attempt. An allowed explicit refresh creates a durable fresh attempt; poll, callback, resume and display requests recover it. Stage/outcome records are deduplicated per attempt under a connection-scoped advisory lock; HTTP failures retain a separate operation ID for diagnosing retries. Counts use distinct attempts, not event volume. Failed and successful stages can coexist when an attempt recovers. A later failure is not labeled a recovery from an earlier success. Optional product errors are displayed independently of core journey failure.

## Stages and timing boundaries

- `link_request`: accepted bank setup; duration covers the Clover request through link creation.
- `link_url_created`: provider URL request/response; not proof that the hosted page loaded.
- `finverse_open`: authenticated client launch request; not provider page-load time. Native launch telemetry requires the next binary.
- `authorization_return`, `token_exchange`, `token_refresh`: Clover-observed authorization and token operations. Finverse owns login and MFA; no internal prompt timing or credentials are available.
- `retrieval`: provider readiness, pending/success/failure. Duration is the observed wait after Clover’s retrieval-start milestone when both exist; not bank processing CPU time.
- `product_accounts`, `product_online_transactions`, `product_historical_transactions`, `product_statements`: separate product states and structured errors. Optional statement failure cannot establish that accounts or transactions failed.
- `account_list`, `account_selection`: provider account retrieval and selection/mapping progress.
- `transaction_page`: one paginated HTTP request; `transaction_fetch`: the entire paginated fetch.
- `clover_save`: account mapping plus transaction persistence intervals, excluding intervening transaction retrieval.
- `data_available`: validated usable bank balance or booked transaction available from Clover.
- `first_data_displayed`: existing ownership-validated client acknowledgement. A missing acknowledgement is a coverage gap, not proof of no data.
- `cancelled`, `resume`: explicit setup cancellation and return to an unfinished flow. Closing the provider browser alone does not cancel the durable connection.

Older native builds benefit from shared server stages. Do not claim full native client launch/render coverage until that binary includes and exercises the relevant client acknowledgements. The existing display endpoint remains compatible.

## Interpretation and next actions

The monitor lists stage/code, distinct affected attempts, current provider states, a suggested investigation and owner, plus chronological per-attempt traces. These are diagnostic leads, not proof of root cause. Unknown errors explicitly remain unknown. Unfinished after 15 minutes is not counted as a terminal failure. Historical connection/product snapshots never become synthetic PostHog successes or invented latency samples. Provider record counts do not establish extraction accuracy or completeness.

The PostHog tables use production customer events by default. Bank, stage, platform and version can narrow the diagnosis. Low sample counts remain visible. Charts are empty until instrumented traffic arrives. No outgoing alert or scheduled delivery is configured.

## Verification

`npm run qa:bank-monitoring` checks error privacy, product separation, recovery ordering, concurrent request isolation, stage deduplication, refresh attempts, failure isolation, ownership, strict payloads and admin access. `finverse-bank-journey-db-regression.ts --execute` is guarded to a disposable loopback PostgreSQL database; it exercises actual instrumentation, callback errors, selected-account sync, display acknowledgement, replay and preservation of confirmed transactions/account safeguards. Never run it against staging or production financial data.

## Selection attribution, including no return

For eligible authenticated linking requests, Clover saves a `preparing` connection and commits `bank_selected` plus `link_request.started` before fresh catalog or URL-generation requests. The bank ID survives catalog failure, URL failure, a closed page and no provider callback. A current cached public name is reused without a provider call; when unavailable, the ID stays known while the name remains unverified. Successful catalog validation records `bank_selection_validated` and the verified public name. `preparing` records cannot produce actionable linking reminders; only a successfully created URL advances the setup to `link_pending`.

The selected bank remains the attribution key across callback, polling and refresh; later provider identity is retained separately as `resolved_bank_id`/`resolved_bank_name`. The report reads origin records independently of the selected reporting window, and groups by original bank ID. Legacy setups with no selection evidence retain their existing attribution; unknown choices are not fabricated. These writes affect operational setup/audit records only.

After 15 minutes, attempts with a recorded start and no authorization return, data, observed failure or explicit cancellation form an incomplete/no-return cohort. The monitor distinguishes a reported browser launch, URL readiness with launch unobserved (including older app builds), and interruption before URL readiness. URL creation alone never proves that Finverse opened. A missing return is not an authentication failure. These classifications are computed when the report is read; no per-bank polling or timeout job is added.

The durable boundary is receipt of an eligible selection by Clover's server. A tap that never reaches Clover (for example, an entirely offline device) cannot be established by this server-only change. PostHog delivery remains background work; the durable audit and connection retain selection independently of a callback or analytics delivery. No mobile binary is needed for server-accepted selections in existing builds.
