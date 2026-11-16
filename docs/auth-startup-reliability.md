# Sign-in and startup reliability

November 5, 2026. Scope: web custom sign-in and the next native app source release. No customer credentials, sessions, Clerk security settings or financial records are changed by this work.

## Evidence and limits

The launch review identified repeat native sign-in failures and iOS bootstrap timeouts. Read-only PostHog record inspection confirmed that existing auth failures contain only `authentication_error`; those historical events cannot establish wrong passwords versus network/provider/session failures. Some iOS bootstrap events have durations of minutes or hours despite a nominal 25-second timeout, interspersed with successful requests around one to five seconds and duplicate bootstrap starts. This is consistent with suspended JavaScript timers and overlapping foreground work, not proof that a customer waited in the foreground for the entire recorded duration. Staff, automated and anonymous identities must be separated before calculating customer rates; this investigation's trace samples are not a new customer KPI.

## Corrections

- Native startup begins authenticated network verification alongside secure storage rather than after all saved presentation pages load. A late disk snapshot cannot replace fresh bootstrap data or seed stale page caches. Remembered Profile selection is reconciled only against freshly authorized Profiles; manual selection takes precedence.
- Concurrent bootstrap requests share one in-flight operation within the signed-in Session. Backgrounding cancels it, resuming starts current work without waiting for the network reachability probe, and closing/signing out cancels it. Late completion of canceled work cannot replace newer data.
- Native request deadlines cover both fetch and response-body consumption and settle even when a native implementation ignores abort. A canceled request is not a timeout or a reason to clear the session. Late bodies cannot emit `data_ready` or a success outcome.
- Token retrieval is bounded. A rejected GET can fetch a fresh Clerk token and retry once. Financial mutations never replay automatically on an authentication failure. A second rejection remains an error; this does not bypass Clerk, Profile authorization, revocation, or offline expiry.
- Signed-out entry no longer sends an invalid authenticated bootstrap request.
- Automatic session recovery does not reload Clerk's client while an explicit password/OAuth attempt is in progress. The existing verified-session-only recovery and pending-verification exclusions remain intact.
- Slow initial Clerk loading and slow cold authenticated bootstrap reveal an actionable retry view after eight seconds rather than leaving the native launch image indefinitely. The retry uses the same configured Clerk instance; it does not create an identity or accept a verification challenge.
- The web custom form handles Device Trust (`needs_client_trust`) using its existing supported second-factor flow, in addition to MFA. Verification is completed before activation. See [Clerk's Device Trust custom-flow guide](https://clerk.com/docs/guides/development/custom-flows/authentication/device-trust).
- Native auth telemetry records method and an allowlisted reason: credentials, rate limit, verification, network, provider availability, session recovery or cancellation. Raw provider messages, codes containing untrusted data, addresses, passwords, OTPs and callback URLs are never included. These remain authentication-step outcomes, not proof that Home rendered.

## Timing

New `native_startup` flow operations measure JavaScript-root/sign-in to the first committed Home content. Each operation ID has one terminal outcome, including bootstrap/Home failures; explicit retry or foreground recovery starts a new attempt. Going to background cancels the attempt; resuming while awaiting Home starts a separate resume attempt so suspension is not included as foreground loading. Signed-out entry and a configured non-Home destination are cancellations, not successful Home loads. This boundary excludes OS launch before JavaScript starts; a `sign_in` attempt starts when Clerk exposes the authenticated identity, so manual typing and provider verification are measured separately by auth-step events. Missing terminal events (process kill, crash or app never returning) must remain in the analysis rather than being silently excluded from reliability reporting. No historical timing is backfilled.

## Verification

Actual SessionProvider, API transport, recovery hook and web form regressions exercise synthetic provider/storage responses:

- Signed-out request exclusion, concurrent startup, and network-before-storage progress.
- Fresh-token retry once, no mutation replay, late disk snapshot exclusion.
- Native fetch/body ignoring abort, timeout settlement, background cancellation, late-success telemetry exclusion and subsequent recovery.
- Explicit authentication surviving background/foreground without competing client reload; recovery after cancellation and no new login on signed-in resume.
- Device Trust and MFA preparing verification, displaying the code field and activating only after verified completion.
- Startup outcome deduplication and background-duration exclusion.

The existing offline safety suite additionally verifies expired access, 401 cache refusal, revoked Profiles, data-wipe epochs, queued mutation preservation and sign-out cleanup. Existing warm/cold OAuth callback and session-recovery regressions remain required. Full `npm run qa:prepush` is required before staging push.

## Rollout

Web verification handling is available after staging deployment. Native fixes are source changes and require a future iOS/Android build to reach installed apps; deploying the web server alone cannot change installed client startup behavior. No installable binaries or production rollout are part of this task. Provider-authenticated sign-in on physical devices and measured production improvement remain follow-up acceptance checks; synthetic tests do not establish a production p90 improvement.
