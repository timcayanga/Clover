# Authenticated native parity follow-up — 25 September 2026

## Scope and fixtures

Reference: mobile web and the Home Mobile frame `1240:59000` in Clover Screens (`FNnCmCj90szZAnZ6twMPCy`). Native implementation is shared Expo 57 / React Native, not SwiftUI.

Created a new Clerk development QA identity, with USD as the preferred currency, a synthetic PHP Metrobank account and three synthetic transactions. Only this new QA identity's data was created. Credentials are stored outside the repository and are not included in evidence.

## Corrections

- Device Trust email verification continues the password sign-in instead of reopening a second login form.
- App bottom navigation is excluded from onboarding, where it covered Continue.
- Bootstrap carries the user's preferred currency. Home and the new-account editor use it; Reports starts with it and limits its choices to the profile's account currencies.
- Home's two monthly boxes combine currencies using the shared decimal conversion helper. Missing rates produce an unavailable total rather than a partial total. Transfers and dates outside the window are excluded; report charts keep their currency separation.
- Transactions, Recurring and Accounts expose Adviser alongside Add. Header titles are centered within symmetric bounds.
- Transaction review indicators sit with the title, preserving the amount column and detail chevron. Amounts and accessibility labels include their direction.
- Reports summary cards use the shared circular information control with accessible explanations.

## Observed Android results

Release APK installed on Clover Parity API 35, preserving the QA session.

- Password sign-in, Device Trust email verification, and onboarding completed.
- Home: centered balance, exactly two monthly boxes, wallet quick access, Adviser section and floating navigation observed.
- Menu: section headings and icons observed.
- Add Account: four selectors on one row. Free Connect shows the upgrade CTA (`android-connect-free.png`).
- Transactions: authenticated synthetic rows loaded without the old summary cards or extra Add button. Search and Filters share a row.
- Investments: centered title, Adviser, equal round Filter/Add controls, three-plus-two tabs, colored summaries and Add Investment empty action observed (`android-investments.png`).
- Recurring: Menu, centered title, Adviser and circular Add observed; no search or filter bar. Five tabs use two rows. Planned Payments wraps at this device width; Installments stays on one line.
- Split Bills: four equal tabs including Payments, two balance summaries and circular creation controls observed.
- Accounts: four summaries per currency, banks before cash, and expandable bank row observed. Opening the visual card was interrupted by host resource pressure and is not recorded as passed.

## Verification boundary

This is not a complete parity certification. The Home Adviser content, related transaction actions, populated Recurring/Circles/Budgeting/Goals/Investments states, profile photo, Finverse native return flow and remaining settings need same-account device checks. The QA identity is Free; no live bank was connected or synced. Earlier preview results are documented separately in `../native-mobile-web-parity-2026-09-24.md`.

Local full `qa:prepush` passed. A subsequent pre-push rebuild and iOS compile encountered host disk exhaustion; neither failure was bypassed. Generated task build caches were removed and builds are retried sequentially. Final deployment and iOS results will be appended after verification.

## Deployed checks

- Staging commit `aeaa3b9ba1ed4e41ab6e595d3af6459468b87a02`, deployment `dpl_9qJsk8AHLx3688Azq7wZNRdLKkyz`, READY and aliased to `staging.clover.ph`.
- Full pre-push hook passed; no hook was bypassed.
- Authenticated bootstrap returns preferred currency USD. Reports without a currency parameter returns USD and exactly PHP/USD choices.
- Authenticated Home returns USD, combined monthly income USD 189.32 and expenses USD 8.93 at the current exchange rate. The USD-only report window remains income 100 / expenses 0, confirming currency-specific charts are not mixed with the converted hero.
- EAS Preview was missing `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Cancelled the two initial builds, restored the existing verified Clerk TEST publishable key to Preview only, and confirmed both replacement builds load it. No private Clerk credential was sent to EAS.
- Replacement store-test builds: Android `cd632963-a4fe-448c-b00c-ad4764913ff8`; iOS `45070083-46bc-4ba2-8ae5-c8dcf360f142`. They target staging and are not submitted to stores by this workflow.

## Build follow-up

- Signed iOS store-test build 13 (`45070083-46bc-4ba2-8ae5-c8dcf360f142`) finished successfully.
- The local simulator retry revealed stale generated CocoaPods references after the Expo patch update: ToolbarItemVisibilityPriorityOptions, ToolbarItemPlacementOptions and ScrollEdgeEffectStyleModifier existed in installed source but were absent from the Pods project. Refreshed the ignored native project with CocoaPods, preserving source and app data. Simulator verification remains pending the corrected local build.
- A Reports request for unsupported EUR also returned USD with PHP/USD choices, as intended.

## Final iOS runtime results

The corrected Release simulator build passed and was installed on iPhone 17 Pro / iOS 26.5. The same new QA account completed password sign-in and Device Trust email verification through Clover's form.

- Home: preferred USD, balance USD 898.14, one monthly income box USD 189.32, one expense box USD 8.93, centered balance, quick access and glass navigation observed. Evidence: `ios-home.png`.
- Reports: USD default, exactly PHP/USD choices, USD selected. Circular summary information control opened the expected Income explanation. Evidence: `ios-reports-currencies.png`.
- Accounts: four summaries per currency, Metrobank logo loaded, bank card expanded, and tapping it opened Account Details. The compact edit control, visual card and both synthetic PHP history rows were visible. History opened the corresponding Transaction Details.
- Transactions: Adviser visible, Search/Filters on one row, three compact rows with signed income/expense amounts. Accessibility labels contain formatted amounts rather than literal template text.
- Add Transaction: Manual / Ask Clover / Upload / Sync, with Table entry on the right. Free Sync shows the upgrade CTA (`ios-sync-free.png`).
- Add Account: four selectors on a single row; Manual defaults to USD; Connect shows the Free upgrade gate (`ios-connect-free.png`).
- Recurring: centered title, Adviser and circular Add; no search/filter controls; five tabs in two rows. Planned Payments wraps; Installments does not split within the word.
- Investments: Adviser/Filter/Add aligned, round controls, 3+2 tabs, colored empty summaries and Add Investment action observed. Populated chart range controls were not exercised.
- Split Bills: four equal tabs including Payments, two summary cards, search/filter row and circular empty-state actions observed.
- Budgeting and Goals: their empty-state setup choices and bottom Create actions were present. Circles: bottom Create Circle card observed.
- Adviser: Menu at left, View Reports at right, no Cloud Adviser dropdown.

Signed Android store-test build 14 (`cd632963-a4fe-448c-b00c-ad4764913ff8`) also finished successfully. Both store-test builds target staging and have not been submitted by this task. These results supersede the pending iOS build statements above, but do not remove the content/flow gaps in Verification boundary. No full parity sign-off is claimed.

## Shared Home content and investment controls follow-up

Staging commit `017ba95aa0294b37e729bfa29339dc0cc08a2f9f` is READY as deployment `dpl_BB8RPrCFBWP8PiXhrvWY9ZPSimNg`, aliased to staging.clover.ph. The full pre-push gate passed after merging concurrent staging import changes.

- Web and native now use the same Home Adviser insight builder. Monetary tokens preserve hidden-balance privacy. Native Home also receives shared Next Steps and separate per-currency weekly/monthly charts, while its hero retains exactly two converted monthly boxes.
- Native investment history has adjacent, matching investment-selection and range controls. Empty selection stays empty.
- Updated the existing Figma Home balance (`228:86`, inside `1240:59000`) to center its label and amount, with the eye beside the label and trend beneath. Visually checked the resulting card.
- Added synthetic budget, goal, recurring bill, circle and investment fixtures only to the new QA account. iOS loaded their populated list/detail states; budget 560/1500, goal 5040/30000, recurring due 600 PHP, and investment 2500 USD / gain 100 USD / return 4.17% were observed. Recurring detail was not reached and is not marked passed.
- Cloud device-preview builds finished: iOS simulator `6e881dcc-98b5-4ed2-bcec-14c7ba9746b5`; Android APK `b56b44eb-bfb0-4da5-86eb-1cce1c371cf0`. These contain native commit `df54bf3a`; the later merge changes web/import files only. They are not store submissions.
- Installed the new iOS build preserving the QA session. Home renders real upload/cash-flow/review insights; hiding balances masks the cash-flow text and chart accessibility labels. Upload now opens Add Transaction with Upload selected.
- iOS investment selection opens with the test portfolio checked; clearing it produces zero selected and no history. Select all restores it; 1M range applies. Evidence: `ios-investment-controls.png`.
- Remaining: Android checks of this new build, Finverse Plus/Pro native callback and sync/unlink, profile-photo fixture, related transaction actions, and further populated settings/report/detail checks. Full parity is not certified.

## Android device-preview verification

Installed the finished APK on the API 35 emulator. Its package is `ph.clover.app` (the earlier local preview used `ph.clover.preview`). Signed into the same synthetic QA account through password and Device Trust verification; no authentication bypass.

- Tutorial opens immediately with four pages, persistent Sign Up / Log In, and no app bottom navigation. Login remains light and exposes the in-field eye, teal Forgot password and Google action.
- Home displays the shared Adviser cards and correct combined hero totals. Evidence: `android-home-insights.png`.
- Investment selectors share one row and matching heights/fonts. Deselection yields zero selected and no dated series; Select all restores the portfolio; 1M applies. Evidence: `android-investment-controls.png`.
- Accounts shows USD and PHP summaries, Metrobank logo, expanded visual card, Account Details and the synthetic transaction detail. The visual card expands within details.
- Budgeting and Goals show the fixture values and bottom Create actions. Their detail pages open with their section tabs and edit actions.
- Circles shows the new circle and Create Circle card; Circle Details opens with all eight tabs and zero shared totals.
- Recurring shows PHP 600 due and the September 28 entry. The saved-item action expands the bill details, including account, cadence, Edit and completion controls. Details appear below the list and required scrolling; this is a remaining interaction difference to compare against web. No completion/deletion action was performed.

Remaining coverage is unchanged for Finverse Plus/Pro return/sync/unlink, profile-photo rendering and the full settings/report/detail matrix. The new builds and staging changes are verified for the cases above; full parity is still not certified.

## Continued local parity work — September 25

- Recurring selection opens a focused detail screen rather than content below the list.
- Transaction detail Notes now reads and writes userNote consistently. Type, line items, quantity/currency, and report exclusion are editable; raw source descriptions remain separate.
- Added native transaction actions for linked Split Bills, Circle sharing, and Recurring schedules. Split linking verifies the transaction belongs to the selected Profile before forwarding to the shared server handler.
- Plan displays actual Profile/account/token usage using shared server limits. Native referrals reuse existing eligibility and reward rules, with explicit terms acceptance and sharing controls.
- Account history shows transaction direction with signs. Account-level bank status exposes loading and retry instead of silently hiding a failed lookup.
- Mobile typecheck and mobile API regressions passed. Full qa:prepush passed, including the production web build. Local Android release compiled successfully. No EAS build was started in this continuation.
- Figma transaction detail reference inspected: frame 1244:514012, including Notes, Line items, source details, Split Bills/Circles/Recurring. Existing approved design already specifies these restored controls.
- New device interaction checks remain in progress; these code/build checks alone do not certify full parity.

## Local candidate interaction checks — September 25 continuation

- Staging `d2585c892df6f5630fffd7ad2c546dceda0a9bf0` is READY (`dpl_GcPPZnTY6aUEnkjvtZM7m7gLVJRw`). Normal pre-push verification passed; SSH keepalive was needed for the long hook.
- Native dependencies/configuration are unchanged from the verified `df54bf3a` runtime. iOS checks used that simulator runtime with a freshly exported Release Hermes bundle, re-signed and reinstalled with its QA session preserved. This is JS-only runtime verification, not a fresh full native compilation. The redundant full compile was stopped. Android assembled a fresh local Release APK successfully (3m 4s). No EAS build credit used in this continuation.
- iOS transaction Notes and line items saved and persisted; Cancel preserved the previously saved note. Split Bill handoff retained title/date/PHP560, validated participant count, and created a linked bill with a fictional participant only. The detail subsequently displayed Open in Split Bills.
- Device testing exposed two Add To errors: Recurring submitted a number instead of the API's decimal string; Circles omitted the Profile query parameter. Fixed both. iOS retests displayed Added to Recurring and Added to Circles. A shared payload regression validates decimal precision and month-end scheduling against the actual API schema.
- Figma Transaction Details main component and eight variants now have Menu at the left, centered title, and Adviser/close controls on the right. The final exported frame was visually checked.
- iOS Region now has currency, number format, date format and timezone selectors. USD and Asia/Manila were retained without saving any changes. Plan usage loaded 1/10 Profiles, 3/20 accounts after the sandbox account was added, and actual token use; referrals correctly reported no active campaigns. Account settings loaded the synthetic photo and name fields.
- With explicit user approval, accepted Finverse terms only for the disposable staging QA account. Used the provider's public Testbank credentials. Native callback returned to Add Account with four selectors visible and account selection beneath them. Selected USD FX ending 8888; created account `cmugcc4b9000204iap48dl7ky` with USD1923.22 and two transactions.
- iOS Account Details displayed Sync, Unlink and Last Synced. Repeat sync completed provider reauthentication and returned to the same detail with a newer timestamp, unchanged balance and two transaction rows. Unlink confirmation explained retained history and reserved monthly slot; unlink removed the bank controls while preserving the account, balance and both history entries. Reconnection quota and Android callback verification remain pending.

### Additional Android and reconnect findings

- Android loaded the same saved transaction note, line item and linked Split Bill. The newly created Recurring item opens as a focused detail screen with the correct amount, account and next date.
- An install-over-existing-build visual check exposed stale Android drawable caching (Home/Adviser showed different icons). Bundled navigation/interface icons now use memory-only caching so same-version preview installs cannot reuse persistent numeric-resource entries.
- Finverse Android authorization returned to the native callback, but a transient offline state caused the callback request to fail without a retry action. Added online-state gating and explicit retry for failed sync requests. The existing Sync & Offline retry restored connectivity; the pending bank connection remained on the server.
- The sandbox reconnect issued new provider account IDs. Clover recognized the existing account but incorrectly marked its allowance reservation as new. Fixed metering to retain the first quota identity across a strongly matched full-number reauthorization, and reuse the existing account-link row. Matching does not change saved account metadata or balances.
- Transaction reauthorization can also rotate provider IDs. Matching now claims prior-account transaction occurrences once per fetched batch. Reauthorization aliases retain separate raw provider payloads and normalized references to the existing ledger rows, preserving original provider records and confirmed edits. Added regressions for two identical payments, rotated account/transaction IDs, unchanged confirmed rows, replay, and reserved slots at a full allowance. Focused Finverse checks passed; updated-device verification and full gate pending.

## Final candidate checks

- Staging `63cf4a280c053e0ca504d2b30975fa1ccda3418d` is READY at `staging.clover.ph` (`dpl_C3Mf1Jra1ivAQAoSGPdzUKPy5QM5`); the normal full pre-push gate passed.
- Android local arm64 Release compiled successfully (2m46s) with the updated icon cache, bank retry and shared Recurring summary UI. Installed over the existing QA app; Home and Adviser icons are correct, Plan uses the wallet, and the synthetic profile photo is visible. Evidence: `android-final-home.png`.
- Android pending bank selection appeared at the top of Accounts. Reconnected the previously unlinked USD FX sandbox account: selection said Reuse USD FX and Already included this period, with one new slot remaining. It reused account `cmugcc4b9000204iap48dl7ky`; balance remained USD1923.22. History retained exactly two original transaction IDs (`cmugcc5nh000504ialbclj96n`, `cmugcc5qn000704ianeetmp4b`), not duplicates. Account Details and Add Transaction → Sync displayed the bank, last four digits, Last Synced and Sync/Unlink. Evidence: `android-reconnected-bank.png`, `android-sync-account.png`.
- Android Reports defaulted to USD and offered only PHP/USD, matching this Profile. Evidence: `android-reports-currencies.png`.
- Extracted the web Recurring dashboard summary calculations for both clients: debt principal versus due payment, expected income, installment remainder and review counts now share one implementation. Mobile overview retains the one visible card used by mobile web; other tabs display three cards. Focused regressions and both TypeScript checks passed. Final deployed summary check remains pending.
- No additional EAS cloud builds were started during this continuation. Android is a local Release compilation. iOS uses the verified native runtime with a refreshed Release Hermes bundle because native dependencies/configuration did not change.
