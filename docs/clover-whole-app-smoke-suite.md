# Clover whole-app smoke suite — fresh set

Created: September 14, 2026. Status: **Not run — test design only.**

Purpose: one bounded run through the main Clover journeys, including UI, persistence, financial totals, privacy, and Admin. This is a broad smoke check, not proof that every feature, bank parser, device, or edge case is defect-free. It replaces neither the detailed regression suites nor store-release testing.

## Run size and rules

- **40 executions total:** 28 desktop cases, then four mobile cases on each of mobile web, installed iOS, and installed Android. Do not multiply all 28 desktop cases across every platform.
- Budget roughly 3–4 hours once fixtures, logins, and installed apps are ready. This is a planning estimate, not a promised duration. Setup and defect fixes are separate.
- Keep one fixture session/environment alive for the whole run. Use separate browser contexts for different users; reuse their sessions.
- Use staging and disposable QA data only. Do not edit or delete real users or confirmed financial records. Fixture edits/deletions below are deliberate and confined to named test records.
- Record Pass only when every assertion in a row was exercised. Failed assertions = Fail; unavailable dependency or inaccessible platform = Blocked; untouched = Not run. Do not silently skip or substitute RN-web for installed apps.
- On failure, capture actual vs expected plus screenshot/error, then continue independent cases. Mark dependent cases Blocked if the failure prevents them. Do not expand this run into a fix-and-retest loop without a separate instruction.
- Record the staging commit, native build numbers, OS/browser versions, device/viewport, and date. If code changes mid-run, identify affected results; they need retesting.
- Keep the 40-row denominator fixed. Report Pass / Fail / Blocked / Not run separately; these must sum to 40. Report unique defects separately from failed rows.

## Prepare once

1. Staging test accounts: A (Free), B (independent user), an Owner, and a Read-only Admin. Prepare a second Owner only if later destructive-approval testing is requested. Use controlled test mailboxes.
2. Account A has a populated QA Profile and an empty QA Profile. Never reuse a personal Profile. Prefix created records with a run identifier, e.g. `QA-20260914`.
3. Golden PHP fixture, dated within the current Asia/Manila reporting month: bank opening balance ₱10,000; cash opening balance ₱0; confirmed income ₱2,000; confirmed Food expense ₱500 from bank; transfer ₱1,000 bank → cash. Expected bank ₱10,500, cash ₱1,000, My Balance ₱11,500; income ₱2,000, spending ₱500, net flow ₱1,500. Transfers and opening balances are not income/spending. Include a separate USD account of $100 to check currency separation.
4. Prepare one synthetic import file already supported by Clover, with a reviewed expected-output manifest: exactly three PHP expenses of ₱100, ₱200, and ₱300, unique dates/descriptions and an isolated destination account. Also prepare an unsupported file and one low-confidence review item. Store file paths and manifest with the run. If no verified fixture is available, block the import cases rather than invent parser expectations.
5. Prepare an overdue and future recurring item, one investment with a known quantity/price/currency, a split group with A and B, one test payment-method QR image, and a test Circle. Record expected investment valuation from the fixture; do not depend on live market changes.
6. Obtain installed staging builds for iOS and Android. Set desktop to 1440×900 and mobile web to 390×844; also check 320px width in the mobile UI row. Record actual native device sizes.
7. Check auth, import worker, AI provider, and Admin access before starting. Unavailable services block affected cases only. Subscription products are currently pending: this suite checks safe disabled purchase behavior, not real purchases.

Use new scratch records for mutation cases; preserve the golden fixture for total comparisons. Where a case says undo/delete, act only on that case's scratch records. Reset fixture additions before checking golden totals again.

## Desktop — 28 cases

For every page opened, also check: no crash or endless loading; readable text and amounts; clickable primary actions; correct active Profile; no overlapping buttons, clipped content, broken icons, or unexplained empty panels. This UI check is part of that row's result.

| ID | Area and short procedure | Pass criteria |
| --- | --- | --- |
| C01 | Public pages: open Landing, Features index and every linked feature detail, Pricing, Privacy and Terms; follow one signup CTA. | All linked pages load; phone screenshots render; navigation and CTA reach the intended destination; prices show currency and billing interval consistently. |
| C02 | Authentication: sign in with A using email, refresh a protected page, sign out, then revisit its URL. Try one invalid login. | Session survives refresh; logout removes access; protected data is hidden; invalid login shows a recoverable error. Social-provider and password-recovery coverage is outside this small run. |
| C03 | Onboarding: create a disposable user through Clover, complete required prompts, refresh Home. | One user is created on Free; onboarding completes without a loop; chosen settings persist and Home has useful empty-state actions. |
| C04 | Home: select the golden Profile; compare balances and reports; toggle Hide balances and reload. | PHP values match the manifest; USD stays separate; transfers are excluded from income/spending; every Home amount is concealed when hidden and preference survives reload. Restore visibility. |
| C05 | Accounts: create a scratch cash account, rename it, reopen its details. | One account is saved in the selected Profile with correct type, currency, amount, icon and name; changes persist. |
| C06 | Account details: open golden bank, cash and investment account details and an available institution view. | Account identity, currency and amounts agree with lists/fixture; recent activity belongs to that account; return navigation works. |
| C07 | Transactions: create scratch expense ₱123, edit to ₱125/category Food, reopen, then delete it. Cancel a second Add draft. | Exactly one record is created/updated; deletion removes that scratch record and reverses its balance effect; canceled draft creates nothing and resets when reopened. Golden totals are restored. |
| C08 | Transaction discovery: search a golden description, filter Food/current dates, sort, open a detail and return, reload, then clear. | Search/filter results are correct; sort and filters persist on return/reload; clearing restores all rows. Reversed dates show validation; either single date bound works. |
| C09 | Review: open seeded low-confidence item via warning badge, inspect reason, correct and confirm it, reopen. | Badge exposes the issue and editable fields; confirmation persists and removes only this item from pending review; raw source remains available and other unresolved items remain. |
| C10 | Upload: import the prepared three-row file into the isolated import account; wait for completion and inspect results. | Exactly three expected expenses totaling ₱600, correct currency/sign/dates/descriptions; destination Profile/account correct; source file and row traceability retained. No golden data changes. |
| C11 | Upload safety: upload that same file again; then try the unsupported file. | No duplicate confirmed transactions; duplicate handling is explicit; unsupported input shows an actionable error without partial financial writes. |
| C12 | Recurring: create scratch future payment, edit amount/date, open calendar plus Planned/Debt/Installments/Money Owed views. | Saved edits persist; calendar names the payment and represents multiple dues; overdue item is distinct; empty review suggestions are hidden. Merely scheduling does not create a paid transaction. |
| C13 | Reports: choose golden month/currency; switch Donut, Bars, Table; view previous-month comparison. | Each view shows income ₱2,000/spending ₱500 where applicable, same category values and currency; no transfer spending; chart labels readable; previous-month range is the full previous calendar month. |
| C14 | Budgets: create a PHP Food budget of ₱1,000 for the golden month, edit target to ₱1,200, reopen. | Actual spend is ₱500, remaining ₱700 after edit; period/category/currency and target persist. |
| C15 | Goals: create two scratch goals of the same type, edit one and reopen both. | Both remain separate; editing one does not overwrite the other or onboarding focus; currency/target persist; progress does not imply reserved money. |
| C16 | Investments: open the seeded holding and valuation details; edit only a scratch holding's label. | Quantity, price, valuation basis and currency match manifest; saved label persists; no invented real-time price or double-counted balance. |
| C17 | Split Bills: create a ₱600 bill paid by A, equally split with B; record B's ₱300 settlement and reopen. | Each share is ₱300; B owes ₱300 before and ₱0 after; one settlement only; group totals reconcile. No duplicate personal transaction is created. |
| C18 | Split identities/payment methods: open group and People, add a scratch payment method with test QR, edit/reopen it. | Correct people/photos or fallbacks; group card, category, Shared with and chevron render; method fields/QR persist and remain readable. No actual payment is sent. |
| C19 | Circles: as A create a scratch Circle, add B using a controlled invitation, share one golden item as summary; open as B. | B sees only permitted summary, not hidden merchant/account fields or adjacent private records; B cannot edit A's source transaction; original ownership remains unchanged. |
| C20 | Ask Clover: request golden-month spending summary and preview one scratch ₱25 expense, then cancel. | Summary agrees with scoped data, or clearly explains inability; proposed transaction requires confirmation; cancellation writes nothing. Unsupported or fabricated financial totals fail. Provider unavailable = Blocked. |
| C21 | Profiles: switch populated → empty → populated with a transaction selection/draft open; rename the empty Profile. | No data leaks between Profiles; selections/drafts clear; rename persists without moving records; populated data returns unchanged. |
| C22 | Settings: change theme and a reversible display preference, reload; visit Account, Security, Region, Data and Categories; restore defaults. | Preferences persist; dark/light pages remain readable; navigation works; data actions do not execute merely by opening the page. Create/rename one scratch category and confirm it appears in the transaction editor. |
| C23 | Notifications/help: open one seeded notification and mark read; search/open Help; open Contact and Referrals. | Read state persists; linked content opens; Help returns relevant content; contact validation prevents an empty submission; referral view loads without exposing another user's identity. Do not send a real support message. |
| C24 | Plan: inspect Free limits, pricing and upgrade entry; cancel any checkout before payment. | Plan/usage agree; displayed regional price and period agree with advertised offer; cancellation does not grant Pro or charge. Unconfigured purchase flow is clearly unavailable. |
| C25 | Admin users: create a disposable user in Clerk development; find it in Admin; create another through Admin; verify in Clerk. Grant the scratch user temporary Pro and revoke. | Users synchronize without duplicates within documented sync interval (record elapsed time); no Invalid Payload; grant/revoke changes entitlement without changing billing; visible Admin action history identifies actor and target. Do not delete users in this suite. |
| C26 | Admin permissions: open Admin as Owner, Read-only and ordinary B; as Read-only attempt the same scratch tier edit. | Owner can perform permitted action; Read-only cannot mutate; B cannot access Admin data even by direct URL. No unauthorized change is saved. |
| C27 | Admin operations: open work queue, errors, logs, analytics, data QA, approvals, support, inquiries, campaigns/content and notifications; inspect seeded failed import. | Each available Admin navigation destination loads a result or explicit empty state; seeded failure is discoverable with traceable details; destructive/communication actions do not execute on viewing. No bulk retry or message send. |
| C28 | Privacy and recovery: as B directly open A's private transaction/account URLs; as A temporarily take browser offline, attempt a scratch edit, restore network and reload. | B receives no private data; offline write is explicitly pending/failed, never falsely confirmed; reconnect leaves at most one intended update and allows continued use. |

## Mobile — four cases on each platform (12 executions)

Run the same four flows on mobile web, installed iOS, and installed Android. Use the same staging fixtures and platform-specific scratch names. Native builds must actually be installed and opened; a successful build alone is not a pass.

| IDs (web / iOS / Android) | Short procedure | Pass criteria |
| --- | --- | --- |
| C29 / C33 / C37 | Launch/sign in; visit Home, Accounts, Transactions, Recurring, More and Account; background/resume native or reload web. | Correct user/Profile, golden balances, intact session, usable bottom navigation and full Transactions label; native dark-background app icon correct; no launch crash or navigation trap. |
| C30 / C34 / C38 | Add scratch expense ₱25, edit to ₱30, search/open it, delete it; switch Profile with a fresh canceled draft. | Correct values persist; keyboard does not cover Save; Add sheet/back/cancel/navigation work; selection/draft does not leak between Profiles; golden totals restored. |
| C31 / C35 / C39 | Open Upload via file picker and cancel; open camera/microphone inputs and deny permission, then return to Manual. Open seeded review warning. | No accidental upload/transaction; denial has recovery guidance rather than crash; Manual remains usable; warning does not overlap amount and opens the issue. If device/browser lacks an input, an explicit supported fallback is required. Successful capture is outside this run. |
| C32 / C36 / C40 | In light then dark mode open Reports (all three chart controls), Split Bills group/payment method, Budgets, Goals, Investments, Circles and Settings. Check mobile web also at 320px. | Main content/actions reachable; correct photos/icons, readable QR, unclipped amounts and charts, no horizontal overflow; safe areas and bottom navigation do not cover content. Compare displayed golden values with desktop. This is a presentation/navigation check, not repeat CRUD for every module. |

## Result capture and completion

Use the companion CSV. Each row needs status and brief actual result; failed/blocked rows need evidence or a blocker. Screenshots can be shared across grouped assertions when clearly labeled. Never store passwords, tokens, or personal financial data in evidence.

At the end, report:

`40 total = __ Pass + __ Fail + __ Blocked + __ Not run; __ unique defects.`

List platform coverage, build identifiers and highest-impact defects. A run is fully executed only when all 40 rows are Pass or Fail. A run with Blocked rows is incomplete, even if every executable check passed. Retest only changed/affected rows and retain their earlier evidence.

## Deliberately outside this one-run suite

- Exhaustive institution/file-format parsing, large datasets, load/soak tests and penetration testing.
- Full pixel comparison to every Figma frame, every screen size, accessibility audit and every subpage mutation.
- Real store purchases/restores/renewals/refunds (products pending), public release and store review.
- Every social login, password reset, real camera capture, push delivery and background sync condition.
- Permanent user/financial-data erasure, second-Owner destructive approvals, scheduled grant expiry, live billing changes and outbound campaigns. These need dedicated controlled integration tests; this suite does not certify them.

Scope basis: current web/mobile routes, `user-management-spec.md`, `circles-product-spec.md`, approved Home/Transactions defaults, September 14 Figma refresh and current mobile store setup. This is a new suite; no results are inherited from earlier QA runs.
