# Clover analytics coverage

Tracking contract version 2, September 20, 2026.

## Coverage and interpretation

| Surface / flow | Instrumentation | Meaning |
|---|---|---|
| All Next.js pages, including public/features/Admin | `$pageview`, `page_engagement`, `ui_interaction` | Route view, foreground engagement, safe action names and click position |
| All Expo Router screens, including auth and onboarding | `screen_viewed`, `screen_engagement` | Redacted screen route and foreground duration |
| Web/native API mutations | `flow_started`, `flow_completed`, `flow_failed`, `flow_canceled` | One correlated **request attempt**; not proof of a full multistep business outcome |
| Accounts, transactions, recurring, investments, split bills/people/groups, circles, budgets, goals, settings, review, Adviser | Shared request instrumentation plus existing semantic events | Operation is HTTP method + redacted endpoint; bodies and error messages excluded |
| Native authentication | `flow_*`, phase `authentication_step` | Each auth step; verification may still be required after a successful step |
| Native purchase/restore | `flow_*`, phase `store_confirmation` | Store SDK result; backend entitlement verification remains authoritative |
| Dialogs / native form routes | `form_opened`, `form_closed` | Open/close only; closing never implies success or cancellation of an in-flight save |
| File picker / camera / dictation | `input_started/completed/failed/canceled` | Selection or recognition outcome; excludes filename, photo, transcript and document contents |
| Native local Adviser/file explanation | `flow_*`, execution `on_device` | Local operation outcome; a supported fallback explanation can be a successful result |
| Offline transaction queue | `offline_action_queued`, sync start/completion/failure/conflict, discard | Queued locally is distinct from synchronized successfully |
| Native file queue | `offline_action_queued`, cancel, upload request outcomes | Chunk and status polling are excluded to avoid event amplification |
| Import pipeline | Existing upload/parse/enrichment/review semantic events plus request events | Background worker events are labeled server-origin where device context is unavailable |

## Timing boundaries

- `page_render_completed/slow`: two animation frames after the route effect commits; **not** total website or data load time. Replaces the misleading `page_load_completed/slow` emission.
- Web `data_load_completed`: response headers received; property `timing_boundary=response_headers`.
- `data_ready`: JSON/text response consumed successfully; **not** a claim that React has painted every widget.
- Native API and XHR completion: response body available/parsed. Streaming/polling and background processing retain separate pipeline events.
- Each flow attempt has an `operation_id`. Web/native fetch requests forward it so request-scoped backend semantic events can be correlated.

## Device and identity

- Web: desktop/mobile-web, browser, OS, device class, viewport width; tablet-aware iPad browser classification.
- Native: iOS/Android, device class/model, OS version, app version/build, simulator flag.
- Server events inherit bounded request device headers, or browser User-Agent classification. Workers without a request explicitly use `platform=server`.
- Native and web identities use the same environment-prefixed Clerk ID. Native resets persisted identity before the new session; signing out/switching users resets again.
- No hardware serial number, advertising ID, financial fields, form contents, microphone transcript or uploaded bytes are added by this instrumentation. SDK session replay and DOM autocapture are disabled; custom safe interactions remain enabled.

## Delivery

Native loads the existing public PostHog ingestion configuration from `/api/analytics/config`; no separate mobile secret or PostHog project is required. The app never waits for analytics to initialize. Events are bounded (100 before SDK setup; 500 in SDK queue), batched (20 / 15 seconds) and use SDK file persistence on native. Expo web preview uses memory persistence. Configuration retries on foreground and every minute; first launch without network/config cannot guarantee durable analytics until configuration is obtained. Financial offline storage is separate.

Server telemetry is scheduled after the response where supported, with a five-second delivery timeout and safe failure logs. Browser blocking/privacy controls or unavailable networking may prevent ingestion. Neither successful capture calls nor source inventory alone prove delivery.

## Repeatable checks

`npm --prefix web run qa:analytics` runs in the standard `qa:release` / `qa:prepush` gate:

- All 103 current web/native route definitions retain their static names; record IDs and URL queries are redacted.
- One start and one terminal outcome per operation, matching correlation IDs.
- Mobile API success, HTTP failure, abort, body-ready events and device headers preserve response/error behavior.
- Telemetry exceptions do not break product actions.
- Offline queue, successful sync and conflict behavior, without financial payload leakage.

Browser runtime checks additionally exercise real Fetch/Response, dialog open/close, picker cancellation and observer cleanup. Provider receipt and simulator/device execution evidence must be recorded separately below; neither bundle generation nor synthetic platform labels count as native runtime verification.

## Execution evidence

Pending completion of this implementation's release verification. See the accompanying run report for results and any remaining access/device limitations.
