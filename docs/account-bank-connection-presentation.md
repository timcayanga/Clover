# Account connection presentation — 17 October 2026

Account detail views place bank status and date-only Last synced directly below the existing account card, followed by Sync and Unlink. Unlinked or expired authorization shows Unlinked and Relink. Provider errors retain a retryable Sync action; revocation in progress shows Unlinking and disables duplicate actions. Manual accounts have no bank connection block.

The account-scoped connections lookup includes historical links within the authenticated Profile, prefers a current link over an older revoked link, and exposes only a boolean for authorization availability. Tokens remain server-only. Relink uses the existing bank authentication, account matching and account-selection flow. The scoped response retains sibling accounts from the same owned bank login so Unlink still names every affected account; the compact view renders only the selected card. Shared-login unlink confirmation and history preservation are unchanged. No financial records or lifecycle rules are changed by this presentation update.

Figma reference: [Screens / Accounts](https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=146-355). Canonical details: desktop `1243:505510`, mobile `1243:505509`. Bank connection component states: `2191:100177`, Connected `2191:100163`, Unlinked `2191:100171`. Additional Unlinked screen references sit alongside the canonical details.

The Transactions screen catch-up includes the previously implemented balanced footer with its Add action, financial summaries and page-size controls, mobile infinite scrolling, and review/selection controls. Source behavior remains described in `transaction-list-performance.md` and `mobile-transaction-review.md`.

Verification covers actual connection route execution with isolated persistence, ownership boundaries, historical link visibility, active-link preference, absence of tokens in responses, date-only output, temporary errors and expiry. Local browser interaction uses synthetic accounts, never real bank sync/unlink actions. The complete pre-push gate is required before staging deployment.
