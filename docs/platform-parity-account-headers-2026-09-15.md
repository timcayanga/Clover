# Account detail/header parity — 15 September 2026

Reference: Figma Screens account details mobile master `1243:505509`; asset details master `1244:62678`. Web Account Details source already uses the appropriate Account/Asset Details title and FinancialAccountCard. This pass changes the shared native presentation.

## Changes

- Accounts hides its host header while the shared AccountEditor is shown, restoring it when returning to the list. This prevents duplicate headers for investment detail screens opened from Accounts.
- AccountEditor owns one centered 18px title with back and Adviser controls in add, edit, account details and asset details states. Edit-back cancels the draft; it does not save. Saving and deletion retain existing API/confirmation behavior.
- Non-investment details use a colored identity card, existing account-type art, masked last-four digits when available, and a 40px white edit control. Current display balance is preserved, including unknown values.
- Destructive actions use the shared red action treatment. Account type/source and existing credit metadata remain visible.
- At 320px the identity name has its own row and the header allocates enough title space to keep Account Details on one line. Existing bottom navigation and safe-area wrappers remain intact.

## Verification and limits

Native web preview checked at 390px and 320px using fictional cash and bank accounts: open detail, edit/cancel, delete/keep, add/back, save/open, restored list header and narrow long-name layout. Edit control measured 40×40px; no horizontal document overflow. Full root prepush gate includes web build/regressions, native typecheck and iOS/Android bundle exports.

This does not certify full platform parity. Native account transaction history/recent imports, real institution logos, investment trading history, institution aggregation and valuation history remain gaps. Installed iOS/Android verification remains separate from the browser preview and bundle exports. No simulator was booted for this pass and no store build was distributed.
