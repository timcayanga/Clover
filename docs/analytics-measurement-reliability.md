# Analytics measurement reliability

5 November 2026. Scope: customer measurement, public-web instrumentation, and server capture. No financial records, plans, credentials or authentication settings are changed.

## Findings

Read-only inspection of Clover PostHog project 388373 (UTC) found completed server imports with no `$lib` and `no_user_agent` traffic classification, and web clicks labelled `other`. Existing public-route classification omitted Help, Guides and the new business/refund/dispute pages. Database “real user” filters removed only some synthetic seeds; known owner/demo identities and assigned staff still entered customer totals.

## Customer scope

`analytics_audience` is `customer`, `staff`, `test`, or `unknown`; `analytics_excluded` is explicit. Classification is server-owned. It reuses configured Admin ids/emails and active AdminMember assignments, known owner/demo identities used during launch QA, known synthetic ids/domains, and optional server-only `ANALYTICS_STAFF_EMAILS`, `ANALYTICS_TEST_EMAILS`, `ANALYTICS_TEST_USER_IDS`. Only exact identities or known synthetic suffixes match; an arbitrary complimentary plan or paid subscription does not imply test activity. Keep this roster current when adding staff/demo accounts.

Existing native bootstrap and the web plan-analytics endpoint return these traits alongside plan metadata. Native apps already consume this metadata; no new binary is needed for those identity traits. Classification lookup has a 500ms ceiling and returns unknown on failure. It never blocks access, grants a plan, or writes a user. Unknown event classification is excluded from customer measurement but does not overwrite an established person's audience.

Admin Analytics, command-center customer/adoption counts and customer tracked volume use the same exclusions. Operational user/support/import inspection screens retain their existing access to staff/test activity. The read-only import reliability report separates staff/test upload counts and includes an all-upload diagnostic summary instead of mixing tests into the customer denominator.

PostHog queries exclude explicit excluded/test/simulator/QA events, configured/assigned staff ids (including retained database-id aliases), and current persons matching the staff/test roster. The current-person subquery deliberately avoids relying only on ingestion-time person snapshots. Anonymous traffic cannot be reliably excluded as staff until linked to a known identity. Unidentified historical aliases or deleted identities with no retained linkage remain unknown; do not claim perfect historical cleanup. Old `other` clicks cannot be reconstructed.

## Server events and bots

Server capture uses the pinned official `posthog-node` SDK in a server-only module, immediate awaited capture, no retries or remote flag lookups, five-second network timeout, and safe delivery-failure logs. Its actual SDK library metadata is preserved. GeoIP is disabled for server capture so Vercel's location is not presented as the customer's location. Request platform/device/operation context remains separate from transport source.

Customer queries retain `event_source=server` outcomes, including legacy empty-UA events; browser/native traffic still goes through PostHog's SDK-aware `isLikelyBot(properties.$raw_user_agent)` classification. Never blanket-remove server outcomes as browser bots, invent a browser UA, turn off bot detection globally or delete raw evidence. Staff/test/QA exclusions apply to server outcomes too.

References: [PostHog bot classification](https://posthog.com/docs/web-analytics/bot-detection), [Node capture](https://posthog.com/docs/libraries/node#capturing-events). Heuristic bot classification is not proof of human intent.

## Public pages and CTA vocabulary

Public-page classification includes Help/Guides, business information and legal/refund/dispute pages, plus existing landing/features/pricing/auth/install routes. Published knowledge articles declare a validated `public_resource_path`; generic route sanitization still redacts private identifiers, search values and tokens. Engagement captures the original page before cleanup, avoiding attribution to the next article.

Key signup/store/carousel controls use fixed data attributes. Other public links map only known destinations to fixed actions (signup/login/open Clover, iOS/Android downloads, help/guides/features/pricing/contact/legal/social links). Dynamic text, arbitrary hrefs, names and financial values are never emitted. Unknown actions remain `other` with `action_named=false`; header/footer/main and hero/final CTA placement remain distinguishable. The existing single click collector emits each interaction once; there are no extra per-button capture calls.

## Verification and rollout

The regular analytics gate includes actual browser collectors under a DOM/event double, identity lookup doubles, customer query transport tests, real pinned SDK capture intercepted locally, and existing native/offline telemetry regressions. Assertions cover exact-domain/identity boundaries, dynamic-label privacy, account lookup failure, current-person scoping, SDK provenance, resource navigation cleanup, and no analytics writes to financial data. Live read-only query compilation is additionally checked against Clover's actual PostHog schema; new flags are intentionally absent from the old taxonomy until deployment traffic arrives.

After the full pre-push gate, deploy to the existing staging branch/project and verify READY plus the served commit. Production rollout remains separate. No app binaries or store submissions are part of this task. Post-release measurement must use this scope consistently; raw PostHog exploration remains available for diagnostics and is not automatically a customer KPI.
