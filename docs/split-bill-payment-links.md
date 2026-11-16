# Split Bills payment links

Shared links remain HTTPS URLs at `/split-bill/request/<token>`. Recipients can view their own requested share and payment details, and report payment, without signing in. Reports still require confirmation by the bill owner and never move money. Tokens are bearer capabilities: do not send them to analytics, contact storage, or unrelated origins.

## Website and native handoff

The website offers a user-initiated Clover scheme link on iOS and an Android intent scoped to `ph.clover.app`, with the same guest page as browser fallback. Messenger may prevent external app launches; the page provides instructions and a copy-link action. It never automatically redirects, forces installation, or claims an app opened successfully. An older app may open without understanding the new payment route; the browser request remains usable.

The native source accepts only production/staging HTTPS request URLs and Clover scheme payment routes, validates the token, and carries the trusted origin into the guest screen. Public requests bypass private-session recovery overlays. Returning to the browser uses `expo-web-browser`, avoiding universal-link recursion. OAuth callback handling remains separate and does not trust URL credentials.

`/.well-known/apple-app-site-association` uses distribution identity `6XX38GYURG.ph.clover.app`, verified against the retained October 17 distribution profile. It delegates only payment-request paths and excludes the explicit `browser=1` fallback. `/.well-known/assetlinks.json` uses the **Play app-signing** SHA-256 fingerprint supplied by Play Console's Digital Asset Links snippet on October 23, 2026, not the AAB upload-key certificate. Keep this file aligned with Play signing-key rotations.

The Expo source now includes the corresponding associated domains and verified Android intent filters. **These additions and the guest native screen require a future native release.** Existing installed binaries have the Clover custom scheme but lack the new verified HTTPS registrations and payment screen. Website deployment cannot retrofit entitlements or manifest filters. No mobile binaries or OTA updates are created or submitted for this web release. Test real message-link interception on iOS and Android when the next native release is explicitly authorized.

## Sharing

Creating a request opens a review dialog; it does not send a message. Supported browsers expose a user-initiated phone contact picker for one contact's name, telephone numbers, and emails. Selected contact data remains local to this dialog and is discarded on close. Other browsers can use a manually entered phone/email or the system share chooser. Phone/email actions open a composer for user review; Clover does not automatically send. Multiple bills can be included in one friendly message, each retaining its own request link. Re-sharing saved requests uses the same review flow.

## Verification

`npm --prefix web run qa:split-bill-details` includes URL allowlist/spoofing tests, intent fallback preservation, scheme/HTTPS native route mapping, OAuth isolation, recipient URI escaping, and association-file checks. Browser checks additionally exercise request preparation without sending, selected contacts, canceled/failed picker and share flows, multiple-bill messages, guest details, and reporting errors. Release checks must verify JSON responses with no redirects on both domains. App-open success on existing devices must not be inferred from a successful website deployment.

## Release dependency checks

The October 24 release gate required Next.js 15.5.28 and Zod 4.6.6 security patches. Mobile pins its transitive Zod via an override; `scripts/zod-compatibility-check.mjs` exercises the actual Expo plugin/MCP schemas and every installed ABI Zod consumer, plus invalid and oversized inputs. This retains the normal fail-closed audit and adds no native modules. The upstream Expo CLI currently declares Zod 3; remove the override once its dependency range includes the patched release.
