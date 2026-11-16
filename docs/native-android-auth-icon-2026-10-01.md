# Android Google return and launcher icon

The production Android 19 build accepted Google's redirect, but Expo Router also
opened `clover://sso-callback` as a screen. No screen exists there, so the user saw
an Unmatched Route page while Clerk was finishing authentication.

`mobile/app/+native-intent.ts` now suppresses navigation for the exact Clover SSO
callback on a running app. Expo WebBrowser's independent URL listener still
receives the original callback. Clerk verifies its nonce and finalizes the
session; the existing protected routes then open Clover. Additional verification
and cancellation stay on the existing authentication form. A cold-start callback
opens a clean login with an interruption message. It never replays credentials or
trusts the session ID in the URL. Other deep links, including Settings account
linking, keep their existing destinations.

The Android adaptive icon previously replaced the approved dark app icon with a
pale background and enlarged the symbol inside the launcher mask. It now uses a
dark Clover background and a proportional foreground inset, preserving the existing
artwork. The separate splash image and iOS icon are unchanged. The icon plugin
runs after Expo generates Android resources and fails if their structure changes.

Validation: `npm --prefix mobile run check:auth` exercises installed Expo Router
and Clerk SSO code with mocked device/browser/server boundaries: successful nonce
verification, rejected verification, extra verification, cancel, dismiss, cold
return, unrelated links and listener cleanup. It also checks generated adaptive
icon XML and idempotence. Android prebuild confirms both launcher XML resources
and the dark background. These tests do not replace Google sign-in on the user's
Play-installed device. Both fixes require a replacement Android binary.

Release check on Android: update the production app through Play internal
testing; verify its launcher icon, Google sign-in, browser cancellation and
reopening Clover. If Android kills Clover during browser authentication, retry
from the clean login screen. Existing iOS sign-in remains available in build 17.
