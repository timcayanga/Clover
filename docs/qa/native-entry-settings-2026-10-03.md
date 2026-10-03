# Native entry and settings fixes · 3 October 2026

Design reference: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1972-528311

## Changes

- Auth reveals with a short reduced-motion-aware fade; Settings categories slide horizontally.
- Onboarding persists choices securely per identity, reaches Home without waiting for the server, and retries setup in the background. First-file pickers wait for the starter Profile. Home renders its shell immediately and reuses cached overview data while refreshing; fresh financial data still depends on network latency.
- Transaction entry uses one keyboard inset mechanism, a More details disclosure, Add transaction returning to the underlying page, and Add another retaining entry.
- Entry sheets cover the bottom navigation. File selection persists its source before closing; a session-owned task presents AI consent after dismissal and continues the upload. Drafts remain visible and resumable in global ImportActivity. Photo content type is detected automatically.
- Settings uses a photo edit icon, conditional Remove photo, text actions, dirty-only Save changes, provider logos and small red Disconnect links. Deletion is confirmed inline with DELETE and destructive styling.
- The deletion API accepts DELETE and the previous phrase for compatibility. Store billing cancellation notice remains truthful: deleting a Clover account does not cancel Apple's subscription. Existing deletion/tombstone behavior is preserved.

## Verification

Full qa:prepush gate, including native auth/onboarding/upload tests, TypeScript, offline safety, native API regressions, iOS/Android bundle exports, web regressions and production build. New tests cover durable onboarding retries, identity isolation, delayed starter Profile, picker cancellation/permission errors, successful queue handoff and queue-write failures.

Native physical-device keyboard positioning, picker/consent presentation and animation smoothness still require checks on the replacement builds. Simulator or bundle success does not establish physical-device behavior. No production financial records were changed as part of these tests.

## Dependency security

New GHSA-vfj7-8cjw-p6xm affects braces 3.0.3; no fixed upstream version was available on 3 October. The local patch bounds parsing and AST recursion to 128 levels in parse, compile, expand and stringify. The installer only patches known source hashes, and verification checks all installed locked copies. Regression checks reproduce stack exhaustion in the original compiler and exercise nested strings/ASTs plus ordinary Metro patterns against the guarded version.

The audit gate accounts for this exact advisory only after source integrity and exploit checks pass. Other high/critical advisories, absent patches, malformed reports and advisory-free dependency cycles still block. The existing node-forge backport remains independently verified. Review these temporary mitigations by 1 November 2026 or earlier when upstream fixes ship. CI and EAS run the same patch verification.
