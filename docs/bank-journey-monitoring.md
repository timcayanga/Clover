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

Known expired or already-handled callbacks are recorded as `callback_ignored`, after a stored state-hash match. Expired pending setup is a recorded failure; a replay of a handled setup is an ignored/pending observation, not a fresh failure. Neither is counted as no return. Unknown state is never attributed to a bank. The callback rejection and one-time exchange guards are unchanged.

## Separate user-visible phase measurements

The admin report separates URL preparation, hosted launch-to-return, provider account retrieval, account-list delivery/rendering, selection decision time, account mapping and first usable-data display. Each measurement shows its sample count, missing start/duration count, p50 and p90. Different intervals are not combined into one latency metric.

`account_list_ready` is durably recorded before returning a selectable list. The client records `account_list_displayed` only when at least half of the first account row is visible on the active view. The sync response carries the current attempt ID; display acknowledgements for a stale attempt are rejected. `account_selection_submitted` records explicit selection separately from the existing `account_selection` mapping-completion stage. Client decision time starts at the first visible account row, and is supplied only for the matching attempt. Background/unfocused views cannot acknowledge display. Visibility retries are bounded and do not repeat bank sync.

`first_data_displayed` measures the visible bank balance/transaction preview, not merely saved records or an HTTP success. Response-to-visible and request-to-visible durations use a monotonic client clock. Server-observed ready/save-to-acknowledgement intervals include network delivery and the acknowledgement leg; these are labeled separately. Existing native clients can still send the legacy display acknowledgement, but it cannot become a client rendering sample. Native launch lifetime and new rendering/selection timings require a future app binary; source changes alone do not add those measurements to installed apps.

The current web redirect and Expo system-auth browser do not expose an actual hosted-page-ready event or separate login and MFA timestamps. These three measurements are explicitly **Unavailable**, never zero or inferred from an authorization return. The launch-to-return interval includes loading, login, MFA, user waiting and time away. The native `hosted_session_ended` event describes the system-auth promise lifetime and only an allowlisted result (`returned`, `closed`, `launch_failed`); returning does not itself prove bank authentication. Closing the browser does not mark the durable setup canceled.

Accurate hosted opening/login/MFA timers require documented Finverse page-ready and step-change events, or provider timestamps securely correlated to the attempt. Do not scrape bank credential/MFA pages, embed an unsupported auth flow or relabel an aggregate redirect interval to fill this gap. References: https://docs.finverse.com/ and https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/ . Telemetry never contains credentials, callback codes, hosted URLs, account numbers, balances or raw browser results.

## Repeated sync requests and client runs

Every authenticated, owned `/finverse/sync` execution now creates a fresh server UUID (`sync_attempt_id`) before authorization checks, plan/quota checks, provider work or refresh reservation. `sync_started` and `sync_finished` are durable audit boundaries. A response records its specific result: complete, up to date, partial, empty, retrieving, selection required, authorization required, action required, rate limited, blocked, failed or unknown. An escaped exception is interrupted. A process terminated before recording its outcome remains not finished, with an aged incomplete count after 15 minutes; absence is never fabricated as failure or success.

The response supplies `syncAttemptId` and `syncRunId`, plus the `x-clover-bank-sync-attempt` header on owned requests, including errors. Unknown/unauthorized connections are never assigned bank attribution. Optional client grouping fields are validated UUID/enums; no raw client text is stored. Sync stage deduplication now uses the sync attempt, so repeated provider calls on the same connection retain their own timing and error evidence. Linking journey IDs and the original bank attribution remain separate. Existing once-per-connection `BankLink` activation milestones are preserved and are not used as repeated-sync reliability metrics.

A new web client groups the requests in one `sync()` invocation with `sync_run_id` and labels its first request start and subsequent checks poll. The native source does the same; installed older binaries benefit from independent server-request outcomes immediately but have request-only coverage. Do not count those requests as known user actions or estimate a user-action success rate from them. A client run can end awaiting authorization or selection; it is not proof of a completed provider refresh. The linking/refresh journey remains the correlation across redirects and later user actions.

The admin report separates request results, client-grouped runs and older-client request-only traffic. It retains per-request duration and code. Polling, rate limiting and user-action outcomes are excluded from claims of completed sync; partial/empty returns remain separate from complete data. Failed-to-complete/up-to-date runs can show recovery without erasing the failed request. Existing audit records without a sync ID are never backfilled as synthetic attempts. No new per-bank polling, timeout job or financial write is introduced by monitoring.

New display acknowledgements carry the exact source sync attempt. The server checks owned audit evidence and the current linking attempt before attaching an account-list or first-data display event. An empty or failed result cannot use a previous successful sync's data milestone to claim first-visible data. Older acknowledgements still work with legacy coverage. Repeated-ready checks cannot acquire a bogus retrieval latency by subtracting the original connection/callback timestamp.

The operational `lastSyncAttemptAt` is updated when an owned request begins, including blocked requests, so older connections remain in the current admin monitoring window. Refresh limits continue to use their existing `bank.refresh_attempt` audit records; this timestamp does not consume or reset quota.

## Statement-based validation

Keep operational success separate from independent correctness. Use [bank-statement-completeness.md](bank-statement-completeness.md) and the read-only snapshot/verifier commands to compare original statement occurrences, provider rows and their linked ledger counterparts. Without independently confirmed labels, source/page integrity, matching account/period, provider coverage and retrieval completion evidence, status stays unverified. Do not turn product success, saved counts or the limited historical owner overlap into a bank-data accuracy percentage.
