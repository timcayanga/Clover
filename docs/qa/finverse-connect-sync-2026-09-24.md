# Finverse Connect and Sync — 24 September 2026

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1573-99309

- Alphabetical flag grid: Hong Kong, Indonesia, Malaysia, Philippines, Singapore, Thailand, Vietnam. Institutions retain their Finverse country membership and configured test/live filtering; Clover logos have a generic fallback.
- Removed introductory/search/fallback copy and Resume bank sync. Pending account selection appears at the top of Accounts and inside Connect, without floating quota messages.
- Add Transaction has four selectors, including Sync. Linked account cards show logo, masked last four digits and Last Synced. Without linked accounts it offers Connect; Free users retain the upgrade gate.
- Linked Account Details includes Sync. User-present Finverse refresh supports bank-required verification; non-refreshable identities use relink for the same identity. Last Synced changes only after import completion. Existing confirmed records remain preserved.
- Updated shared native implementation for iOS/Android and the desktop/mobile web implementation.

Validation: full qa:prepush (including native typecheck/bundles and web production build); Finverse request/route regressions for country scope, Free gating, workspace boundaries, masked account display, refresh polling, Last Synced, cancellation and replay protection. Browser component checks at desktop and 390px for flag grid, generic logo fallback, inline selection/quota limit and Sync card. Browser checks used controlled fixtures, not real bank credentials or financial mutations. Installed native previews require a new build/update to receive source changes.
