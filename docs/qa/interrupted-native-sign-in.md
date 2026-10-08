# Interrupted native sign-in recovery

## Behavior

- At authentication startup and on a background-to-active transition, a signed-out UI reconciles the device's Clerk client. Brand-new clients skip the network lookup, and already active users skip recovery.
- Public Clerk `client.reload()` verifies sessions before `setActive`. Incoming callback session IDs are never used. Existing warm/cold callback nonce handling is unchanged.
- The last active verified identity wins. A unique completed server-verified sign-in/sign-up can recover a new active session after a prior session ended. Pending verification/tasks, ambiguous identities and revoked/expired sessions are not activated.
- Entry screens remain mounted behind a blocking, accessible progress overlay during recovery. Returning from Google/Apple does not unmount the form or discard its pending callback listener.
- The normal authenticated bootstrap decides whether to show onboarding or the user's landing page. Recovery does not manufacture an app identity, Profile or onboarding decision.
- An already-signed-in error triggers the same recovery instead of trapping the user on the form. A failed lookup yields a retryable connection message.
- Recovery is single-flight, bounded to eight seconds, and invalidated on sign-out/unmount. A late lookup cannot activate a session after cancellation. No credentials, callback tokens or new auth flags are persisted.

## Checks

- `mobile/scripts/session-recovery-check.mjs`: verifies session choice, server refresh, concurrent calls, MFA/tasks, multi-session ambiguity, expired/revoked access, timeout, retry and sign-out races.
- `mobile/scripts/auth-entry-recovery-check.mjs`: exercises the actual form submit with an already-signed-in response, successful recovery and failed recovery, alongside existing bootstrap retry/sign-out tests.
- `web/scripts/auth-resume-browser-regression.cjs`: real React hook lifecycle with simulated Clerk and AppState. Covers background/resume, retained draft/form, cold restart, already-signed-in foregrounding and cancellation. Requires playwright-core on NODE_PATH. This does not claim physical-device OAuth verification.
- Existing native auth tests still exercise installed Expo Router + Clerk SSO nonce/callback integration. Full root `npm run qa:prepush` includes native type checks, auth checks, both native bundle exports and web checks/build.

## Device follow-up with the next binaries

On both platforms, start password/Google login, leave Clover before completion, and return. Repeat on iOS with Apple. Verify the correct Home/onboarding destination, no Opening Screens loop and no already-signed-in dead end. Also cancel sign-in, test interrupted verification, and confirm explicit logout remains signed out. An unfinished or unverified OAuth attempt may still require signing in again.
