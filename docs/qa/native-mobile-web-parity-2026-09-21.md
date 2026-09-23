# Native / mobile web parity — 21 September 2026

Mobile web is the reference for presentation. This pass changes navigation, typography, icons, and read-only financial projections; it does not migrate or rewrite financial records.

## Changes

- Shared transparent navigation images, grouped Menu on the left, contextual actions on the right, and Clerk profile photo in navigation.
- Branded launch image; iOS Liquid Glass where supported, with blurred navigation on other supported platforms. Content has bottom clearance for the overlay.
- Home balance centered; greeting/profile/currency chrome removed; quick access and Adviser added; sections reordered around reports, budgets, upcoming payments and review. Next steps remain conditional, as on mobile web.
- Monthly change labels suppress missing baselines and extreme ratios, matching mobile web.
- Transactions use search and Filters in one row without duplicate creation or summaries. Details use a read view, compact edit action, source disclosure and line items.
- Account summaries, web-provided brand logos, ordered groups, interactive visual card and existing transaction history.
- Recurring and Investments wrap five tabs; Split Bills uses four equal tabs and Payments. Mobile web creation buttons are circular and Menu remains available beside Back.
- Bottom creation actions for Circles, Budgeting and Goals; investment labels and empty-state action aligned; Add Transaction has Table entry on the right.

## Verification

- Local native UI web preview at 393 × 852, using existing fictional sample fixtures only: Home, grouped menu, Transactions, transaction details, Accounts, opening the visual card, Recurring, Investments, Split Bills and Add Transaction.
- No error-level browser logs during those checks.
- Added numeric regression cases for missing/nonfinite prior periods, the reported 35,178% ratio, normal growth, reductions and rounding.
- Full `npm run qa:prepush` required before staging push, including API safety tests, native type checks, Expo dependency checks, iOS/Android bundles and web production build.

The browser preview cannot validate device-only Liquid Glass, the OS launch screen, or a signed-in native Clerk photo. Those require installing the new signed native build. Existing installed builds do not change from a staging web deployment.
