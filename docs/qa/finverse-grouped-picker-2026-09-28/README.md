# Grouped Finverse bank picker

Figma updated first in file FNnCmCj90szZAnZ6twMPCy:
- Philippines grids: 1573:99434, 1573:99473, 1579:99618, 1579:99639.
- Vietnam grids: section 1633:99789.
- Personal/Business + Beta states: section 1797:100458 (desktop, mobile web, iOS, Android).

Policy: authenticated API availability, six supported markets, Supported/Beta + both Accounts/Transactions products. Alpha, accounts-only and payment-only entries excluded. Real/test remain separate. Known bank brands group within a country; exact connector IDs preserved. Unknown brands never merge solely by similar names.

Checks completed before staging:
- Web and native TypeScript checks.
- Finverse discovery/grouping regression: mixed statuses, correct countries, bank types, unknown brands, distinct UOB business portals, test-mode isolation and provider Link status filter.
- Finverse route regression: workspace/plan authorization, institution validation, callback replay protection.
- Browser: actual picker rendered against the retrieved 254-record catalogue in an isolated local preview. Philippines shows one BPI tile; Business requires Beta disclosure and selects bpi-business. Singapore shows one UOB tile with Personal and two distinct business portals. Mobile-width layout inspected in a 390px iframe.
- No bank authorization, financial data writes, environment changes or Expo cloud builds during these checks.

Staging stays in test mode, so real/Beta connector UI is covered by the local catalogue preview rather than changing credentials or connecting real accounts.
