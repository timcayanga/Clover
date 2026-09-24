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
- Local web production preview requires a Clerk publishable key not present in this worktree; web visual verification uses staging.

## Configuration dependency

Staging environment inventory currently contains FINVERSE_ENABLED, FINVERSE_MODE and FINVERSE_REDIRECT_URI, but not FINVERSE_CLIENT_ID, FINVERSE_CLIENT_SECRET or FINVERSE_TOKEN_ENCRYPTION_KEY. No real bank authorization was performed. Live bank availability and a real account connection require those credentials and Finverse approval.

Primary API reference: https://docs.finverse.com/ — GET /institutions and POST /link/token.
