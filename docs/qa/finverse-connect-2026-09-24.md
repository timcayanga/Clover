# Add Account — Finverse Connect

## Design

[Desktop, mobile web, iOS and Android mockups](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1549-99171).

Connect is the fourth entry method beside Manual, Ask Clover and Upload. Existing manual drafts survive method switching. Bank names in the mockup are illustrative; shipped lists are obtained from Finverse.

## Behavior

- Server retrieves the Philippines institutions list from Finverse, filters by products, supported status, and configured live/test mode, and returns only bank ID/name.
- Selected bank IDs are revalidated before opening Finverse Link. Credentials and bank authentication remain outside Clover clients.
- Web returns to Add Account / Connect in the originating Profile. Signed native apps use `clover://accounts` through the system authentication browser.
- Callback state is single-use and claimed atomically before token exchange. Only validated native state can select the fixed app redirect.
- Users select returned accounts before importing. Plan limits remain enforced on the server.
- Refreshed bank payloads remain in the audit record; existing confirmed account balances and transactions are preserved.
- Cancellation, missing configuration, loading, empty search, retry and account selection have visible states. Native demo mode cannot access bank accounts.

## Verification

- Finverse bank filtering and authenticated route regressions passed: workspace isolation, input validation, fixed redirect, concurrent callback replay and cancellation.
- Native UI preview checked at 393×852 and 320×568. Four equal tabs, no horizontal overflow, bottom navigation visible; unsaved manual draft preserved across Connect switching. No console errors observed.
- Figma composition visually checked after correcting auto-layout and text sizing.
- Full prepush gate passed. Finverse route regressions were added to the permanent release gate; the complete gate is run again before push.
- Staging bank search and empty results verified; unsaved manual draft retained when switching to Connect and back. Desktop verification caught a shared three-column CSS override; creation tabs now use equal-width flex items, and bank choices span the panel.
- Signed native builds completed successfully from commit `74dafc2a`: [iOS build 10](https://expo.dev/accounts/clover-innovations/projects/clover-mobile/builds/04740911-ad99-47aa-ac79-aa18af87a33a) and [Android build 11](https://expo.dev/accounts/clover-innovations/projects/clover-mobile/builds/b223918f-2203-4214-9e95-b356c454e610). No store submission or physical-device authorization test was performed.
- Local web production preview requires a Clerk publishable key not present in this worktree; web visual verification uses staging.

## Configuration dependency

Staging is configured for test mode, as requested. The deployed Connect screen successfully retrieves Testbank from Finverse. Environment exports did not reflect usable runtime credentials, so deployment behavior is the authoritative configuration check. No live bank authorization was performed.

Primary API reference: https://docs.finverse.com/ — GET /institutions and POST /link/token.
