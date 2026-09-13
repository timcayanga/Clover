# Organize and Understand & Plan — September 13 refresh

Reference: Figma Screens `FNnCmCj90szZAnZ6twMPCy`, Page 1 Organize (`0:1`) and Page 2 Understand & Plan (`8:71`). Compared the Figma task's September 12–13 change notes with actual design context for the Bills directory, mobile bill details, resolution confirmation, Circles directory, Budgeting, Goals and mobile Investments. Circles canvas cleanup was still finishing during implementation.

## Changes in this release

- Accounts, Transactions, Reports and Investments: flat summary surfaces, centered 16px semibold labels, 22px semibold values and 13px regular supporting text. Dark-mode legacy gradient overrides removed. Mobile investment summaries use one row with three columns, compact amounts and full values underneath. Native Poppins Regular/Medium files are now bundled alongside SemiBold.
- Buttons: Poppins Medium 15px and white/teal/red action treatments. Goals has confirmed deletion on web and native; obsolete related-account/payment review shortcuts removed. Deleting a goal never deletes accounts or transactions.
- Web investment history has a period dropdown and supporting text beneath the chart. Desktop filters use the menu to prevent overlap with tabs.
- Split Bills: searchable, filterable bill table; group cards with member avatars and overflow counts; People balances; payment-option details. Existing bill deep links open the shared editor, while receipt source details remain accessible separately.
- Bill details: editable items and participant checkboxes, equal/exact/percentage/share allocations, live unsaved settlement preview, explicit payment requests, separate recording of payments received, resolution confirmation and deletion. Native screens now use bounded authenticated API operations for these actions.
- Resolution records an activity event and stops requests/reminders. It does not record payment, alter bill amounts, or change the settlement balances. Resolved and Settled are separate filter states. Existing public request links show resolution and refuse payment-report submissions.
- Receipt source text is preserved when an editor submits a lightweight record without it. A stale edit also preserves an already-recorded resolution and its audit event. Title/description-only edits preserve imported participant shares. Explicit item allocation changes preserve the raw receipt/digital-note payload while making the saved item rules authoritative.
- Circles directory uses flat cards, avatars and View Circle actions. Native Circle expenses open the shared bill editor; members can open relevant bill histories and balances. Fixed native Circle budget progress reading the wrong API field.
- Native groups support bill history, People & balances, metadata editing and confirmed removal from active groups; payment options expose account and QR details with confirmed deletion.

## Verification

All persistence tests used the guarded local `clover_qa` database. No customer financial records were changed by QA.

- 32 page checks: eight routes × desktop/phone × light/dark, checking loading, runtime/framework errors, images and horizontal overflow.
- Four additional investment summary/filter checks: flat cards, 16/22px typography, three-column positioning, non-overlapping desktop header, filter selection and Escape dismissal.
- Seven populated web flow checks: search/empty results, status filtering, summary styling, item editing, invalid/valid percentage allocations, directory tabs and canceled/confirmed goal deletion.
- 18 native populated UI checks run against the actual Expo web export with controlled API responses in both themes; this is not an iOS/Android device execution.
- 23 isolated persistence checks, including added assertions for read-only preview, Profile-scoped goal deletion, source/payment preservation, invalid allocations, resolution without payment writes, public-link resolution and stale-edit source preservation.
- Full `npm run qa:prepush` passed on September 13, 2026: web/native TypeScript, all release regressions, dependency checks, iOS/Android Hermes exports and the optimized Next.js build. The first gate detected that the card refresh removed organizer-only identity editing; the existing editor was restored inside the flat cards before rerunning all checks. Temporary QA routes and the native fixture screen were removed before release builds.

## Remaining design parity

This release does not claim that every Figma example has a corresponding completed native feature. The recent auditable group/member balance-adjustment flow, full native estimated portfolio history, and deeper Circle resource/membership editing still need implementation. Native group/person balances currently explicitly describe the displayed page of bills. Existing native chart interactions and institution trade-history editing remain less extensive than web. These limitations were not counted as passed QA cases.

Vercel deploys desktop/mobile web and the mobile API. Native source and iOS/Android bundles are separate from an installed app release; this work does not upload a signed app to TestFlight or Google Play.
