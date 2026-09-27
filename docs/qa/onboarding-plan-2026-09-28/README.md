# Onboarding, signup, Account menu and Plan refresh

## Changes

- Android splash and adaptive icon use a padded Clover symbol without the wordmark.
- Native signup uses email/password and the agreement. Password-reset confirmation and email verification remain intact. Clerk's public environment confirms first/last name are optional.
- Terms of Service and Privacy Policy are inline links opening the native in-app browser.
- Four onboarding previews are exported at 3× from Clover Figma, with the Connect/Upload/Manual copy and Plus/Pro bank qualifier. Preview balances and account endings are illustrative.
- Public Pricing and web Settings share one Plan card surface. Native cards reproduce its full-card gradients and glass highlights; swipes stop at one card.
- Web/native Account menus use versioned transparent icon assets. No financial records or bank catalogue filters changed.

## Figma

File `FNnCmCj90szZAnZ6twMPCy`:

- Tutorials: `1075:51550`, `1075:51592`, `1075:51641`, `1075:51683`.
- Signup: `1244:513515`.
- Android symbol-only launch: `1792:526645`.
- Account menu: `1775:526190`.
- Plan: `682:93146`.
- Export provenance: `mobile/assets/tutorial/README.md`.

## Validation

- Native TypeScript check passed.
- Figma Plan, signup and tutorial screenshots inspected; tutorial content reflowed to avoid clipping and footer overlap.
- iOS Account menu and Pro/Free Plan cards visually checked in the local simulator before restart.
- Android Account menu and Pro Plan card visually checked after restart, with transparent icons and the shared card design.
- Android local JDK 17 arm64 debug build passed after restart (3m17s). No Expo cloud builds used.
- All seven menu assets have transparent corners. All tutorial exports are 1026×1380.

## Finverse catalogue

Read-only request only. The direct institutions endpoint requires a customer token. Vercel environment downloads did not provide usable client credential values; this does not establish that deployed credentials are absent. An authenticated full-catalogue response has not yet been obtained. The existing institution list and availability rules were deliberately left unchanged.
