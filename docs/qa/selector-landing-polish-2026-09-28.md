# Selector and landing-page polish — 28 Sep 2026

## Changes

- Add Account and the shared three-method setup now drive the animated teal indicator from the selected method and method count.
- Home and Accounts currency controls use currency codes on desktop and mobile web.
- Investments currency choices render above the filter panel. Clicking or focusing the owned currency popup keeps the parent filter open.
- Landing source documents use BPI, GrabPay and GCash logos, without Example labels, with staggered subtle floating motion. Reduced-motion preferences disable the animation.
- The three landing product chapters reserve a photo area below the header and beside the phone, protecting the people from overlap.
- Accounts, Adviser and Split Bills phone previews were refreshed in Figma and exported at 1560 × 3024. These use fictional sample data and fit the complete display. Shared feature-page references also use these new exports.

## Figma

File: FNnCmCj90szZAnZ6twMPCy.

- Landing desktop compositions: 622:26823, 622:26896, 622:26968.
- Refreshed phone source components: 1808:527458, 1808:527490, 1808:527522.
- Branded documents: 1758:526152, 1758:526157, 1758:526162.
- Selected method states: 1814:565973.
- Expanded investment currency menu: 1814:138711 and 1814:138719.

## Verification

- Browser exercised the real AddEntryMethods component at desktop and 390px mobile widths. Connect and Ask Clover selections move the indicator; all four methods share one row. The three-method variant sizes its indicator to a third.
- Browser exercised the real InvestmentPortfolioFilters + CurrencySelector with a deliberately clipped filter container. All Currencies remained visible outside the container; selecting it updated the value while keeping the parent panel open.
- Landing inspected at 1280px desktop and 390px mobile. Desktop photo/phone gap measured 32px, with no horizontal overflow. Both women remain below the header and outside the phone. Mobile has no phone overlay and people remain visible.
- Updated screens load at full 1560 × 3024 resolution. Figma composition screenshots checked for duplicate headers/navigation and corrected before export.
- TypeScript check passed. Full qa:prepush runs through the repository push hook.

No financial data, bank access policy, production environment, or Expo cloud builds changed.
