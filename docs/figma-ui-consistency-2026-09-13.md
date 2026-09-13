# Figma UI consistency refresh — 13 September 2026

Source: the latest completed turn in the Figma task and current Screens file `FNnCmCj90szZAnZ6twMPCy`. References include Accounts `50:419`/`50:660`, Transactions `50:505`/`50:723`, credit-card details `335:259`, Recurring `50:564`, Budgeting `584:27896`/`586:29378`, Reports `572:25773`, Investments `37:721`, and Circles `641:40191`.

## Changes

- Shared action sizing: content widths, 40 px desktop controls, minimum 44 px mobile touch targets, wrapping for long labels. Secondary actions use the theme surface; Circle primary actions use the teal gradient.
- Accounts: visible desktop Add account icon/label; remove mobile currency filters and summary captions; center desktop credit cards with details below; subtle card edit affordance. Account Reports is retained for bank accounts and removed for the other account types covered by the updated designs.
- Transactions: explicit bordered filter control, native filter icon with a stable accessible name, compact selection actions, and three separate footer summaries aligned to the desktop right.
- Recurring: centered summary labels/values without the old explanatory captions. Existing calendar names/multiple bills and conditional review section remain intact.
- Reports: compact summaries; value and comparison colors follow improvement/deterioration, with spending reversed. Savings-rate comparisons use percentage points. Missing prior values are neutral and explicitly described.
- Budget/Goal/Investment actions: compact white/theme-surface secondary buttons; retain natural flow for long content. Mobile Investment summaries no longer repeat captions.
- Circles: Figma default photos, colored cards, gradient initial avatars, teal View/Create actions; shared-goal count removed from the summary only. Actual goals and their records remain available in their tab. User photos remain preferred and are included in the restricted native response projection.
- Desktop Quick Add uses the shared 56 px floating control and existing behavior. Modal suppression remains in place so it cannot obscure an active dialog.

Original Circle exports are retained in `assets/circles/*.png`; 192 px JPEG derivatives serve the UI and native bundles (about 16 KB combined). No store product, billing, financial record, or production data changes are part of this refresh.

## Verification

- Full `npm run qa:prepush`: run before staging push; includes native typechecking, platform bundles, API/privacy regressions, financial safety regressions, and the Next production build.
- Isolated real-component browser checks: six scenarios, light/dark at 1440, 390 and 320 px. Card actions, filter toggle, selection/edit/clear, compact button dimensions, image loading, no horizontal overflow and no runtime errors passed. The harness was temporary and was removed before shipping.
- Expo web preview of native components: 38 checks across Reports, Budgeting, Goals, Investments, Circles and Split Bills, both themes. Sample data only; this is not an installed iOS/Android or authenticated device test.
- Eight additional native-preview screen checks passed for Accounts, Transactions, Reports and Investments in light/dark, including no Accounts filter, the accessible Transactions filter, missing-comparison copy, summary captions, navigation and overflow. The Circle detail summary uses the existing shared SummaryCard component; authenticated Circle detail runtime verification remains outstanding.
- Deployment outcome is recorded in the completion message; do not infer device/store validation from web-preview results.

## Existing setup-dependent work

The store integration/setup guide and Admin governance implementation are already prepared. App Store Connect/Play app registrations, subscription products and RevenueCat setup are still needed before purchase testing. Live native sign-in and permission flows require configured test access. Installed Android visual verification remains pending; previous build/install/start success does not count as a UI pass. Persistent worker hosting has not been supplied or verified; see `admin-import-worker-setup.md`. Admin continues to target production records, so retry/destructive-action QA must use isolated fixtures.
