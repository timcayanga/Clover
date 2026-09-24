# Native parity follow-up — 24 September 2026

- Added the two missing Split Bills balance cards using the same complete authorized workspace and settlement projection as mobile web. The native list remains paginated; headline totals do not depend on its current page. The native response contains only the two formatted labels.
- Both bill mutations and screen refreshes refresh the headline totals. Loading, older-server responses and failures show a dash; errors include a retry action.
- Empty Investments portfolios show a dash instead of a misleading zero valuation.
- Regression coverage includes partial and completed settlements, payer/payee direction, mixed currencies, totals beyond one list page, existing person-name matching, minimal native payloads and unchanged source fixtures.
- Native React Native web preview checked at 320 × 568: Split Bills cards, four equal tabs, search and Filters; Investments two-row tabs, colored summaries and circular header actions. No error-level browser logs. Preview uses fictional samples; device-only appearance still requires installation of the signed builds.

Release validation and build identifiers are recorded in the task results. This pass does not modify financial records or publish to production stores.

## Shared tabs follow-up

- Replaced native tile-style tabs with the mobile-web border, active surface, muted inactive labels, line icons and medium Poppins typography. Four tabs have equal widths; five tabs use three then two. Plus badges wrap without overflow on narrow screens.
- Recurring now uses the same tab component as Reports, Investments, Split Bills and other native sections. Preserved each section's existing selection values and handlers.
- Kept the Recurring month-navigation controls on one row; month text can wrap without detaching the next-month action.
- Verified the fictional-data native web preview at 320 × 568 and 393 × 852: Reports tab overflow measurements were zero; Split Bills Payments, Recurring Installments and Investments Portfolio selections worked; advancing the calendar showed October 2026. No error-level browser logs.

## Screen-by-screen audit and corrections

Reference: authenticated staging mobile web. Native comparison: React Native web export with explicitly fictional preview data, at 393 × 852 and narrow 320 × 740. Differences in account balances and populated/empty states are not treated as visual defects when the two sessions use different data. No financial records were created, edited or deleted during this audit.

| Screen | Findings / corrections | Verification boundary |
| --- | --- | --- |
| Welcome / tutorial | Four pages, light background, persistent Sign Up and Log In; no preliminary welcome screen, sample link, Get Started or bottom navigation | All four pages navigated in preview; native splash still needs device check |
| Sign Up / Log In | Source has inline password eye, teal password-reset action, Google icon, full-width auth actions, no Apple action, light default | Configured authenticated device runtime unavailable; not signed off |
| Shared header / menu | Menu at left; shared sectioned icon menu; added missing Adviser shortcuts; reduced long header text on narrow phones | Preview checks; native safe areas and gestures remain unverified |
| Bottom navigation / avatar | Shared glass implementation and profile-image source exist | Browser fallback checked; iOS glass, Android blur and authenticated profile photo not device-verified |
| Home | Centered balance and quick access present; section order inspected | Adviser card is still simpler than mobile web; review coverage and identical-account percentages require further verification |
| Reports | Corrected overview expense label; restored Adviser alongside Filters | Four tabs and summaries inspected; full chart/content parity not signed off |
| Transactions | Replaced tall date-group rows with compact icon/title/date/category/account rows and colored amounts; retained review indicator and accessible review label | List preview verified; search/filter retained |
| Transaction Details | Compact merchant/date header, smaller edit action, Type first, Adviser and close in header | Preview inspected; mobile-web related-item actions remain a gap |
| Accounts | Removed redundant search, matched section order, stacked totals, expandable account cards with hide and open-details actions | Expansion and navigation verified with sample accounts; real bank logos still need same-account verification |
| Account Details | Visual card and compact history present; Adviser restored | Opening from expanded account card verified; no financial edit submitted |
| Recurring | Added due summary, rounded calendar cells and readable weekdays; currencies kept separate; inactive/missing amounts excluded | Calendar and 3+2 tabs checked; summary regression checks added; other tab-specific summaries remain simpler than web |
| Split Bills | Four equal tabs, Payments label, two balance cards; Adviser restored; centered empty state and circular creation actions | Preview inspected; no bill submitted |
| Circles | Updated intro, gradient bottom Create Circle card; removed shared-this-month amount/copy | Empty directory checked; populated same-account comparison outstanding |
| Budgeting | Dashed bottom creation card | Empty directory and bottom clearance checked; populated cards require matching fixture |
| Goals | Dashed bottom creation card | Empty directory inspected; populated cards require matching fixture |
| Investments | Adviser restored before Filters/Add; long title fits narrow header | 3+2 tabs, colored summaries and circular actions inspected; populated/empty reference data differs |
| Add Transaction | Pill type controls stay on one row; larger amount; purpose label; Category before Date; notes under More details | Preview checked; Table entry remains right; no transaction saved |
| Add Accounts | Existing Manual / Connect / Ask Clover / Upload selectors retained in one row | Prior Finverse test-bank check retained; bank authentication and callback require signed-in device check |
| Adviser | Matched greeting text size; Menu left and View Reports right; no Cloud Adviser selector | Preview checked; authenticated conversations/voice not exercised |
| Settings | Icon rows reordered to match web; Data section titles now use section-title style and requested capitalization | Menu and Data inspected; other settings subpages and Plan/referral presentation are not fully at parity |

### Release boundary

This is an audit with fixes, **not a declaration of complete iOS/Android parity**. Simulator and Android Emulator are installed but were not available through the UI automation interface; opening Simulator by path and bundle ID failed. The user has been asked to open both runtimes. Device-only rendering, authenticated screenshots, sign-in, keyboard/gesture behavior and native Finverse return flow must be verified there. Remaining content differences above are explicitly open.

Validation: native TypeScript, focused Recurring summary checks, full `qa:prepush` (including native bundles and production web build), and browser-preview visual checks. The temporary preview demo flag is restored to false before any release build. Store builds do not publish to production stores.
