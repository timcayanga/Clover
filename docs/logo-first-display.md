# Logo-first transaction and investment display

Transactions use the matched merchant logo in the existing leading icon slot on desktop, mobile web, iOS and Android. Unmatched, ambiguous, conflicting, stale or failed artwork retains the category icon. Account branding beside the account name remains separate. A payment processor or shared parent company does not identify an unknown merchant.

Merchant identity uses the reviewed library snapshot `2026-10-15.73` (5,155 artwork entries). Resolution is advisory and occurs on the server while returning transaction data. It does not update financial records, categories, merchant rules, review state or confirmation state. Existing transactions can use the library without a data migration. No AI request or AI allowance is used for logo selection.

The native API projects only the matched artwork URL and a merchant-name key. Raw evidence and the full research catalog remain on the server. Offline edits that change the merchant name invalidate the displayed logo. The research JSON is loaded with an explicit type boundary to avoid TypeScript inferring thousands of large literal object types.

Investments use exact security names or supported tickers, with exchange context for collisions. Conflicting name/ticker evidence falls back. The broker cannot stand in for an unknown stock or crypto asset. Recognized deposit products can retain their issuer's identity; user-selected custom artwork is preserved. A failed investment logo retains the asset-type icon.

`assets/logo-library/` contains only the runtime artwork snapshot. The build copies it into generated public assets. Keep the generated catalog and runtime snapshot together when importing future library updates. The research source library and downloaded originals remain in the original workspace.

Verification: `npm --prefix web run qa:logos`, investment regressions, compact mobile API projection regressions, and web/native type checks. Native rendering changes take effect in a subsequent app build; no signed binaries are produced by this change.
