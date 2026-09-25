# Mobile web follow-up

Phone viewports: 390 × 844 and 360 × 800, authenticated staging browser; read-only checks against existing records. No financial edits or uploads.

## Missed alignment found

- Mobile menu remained 280px wide and did not expose a Settings navigation item.
- URL-backed creation flows were full-page panels with X buttons, rather than shared sheets.
- Both transaction entry implementations retained the Table Entry text; Add Investment did too.
- Shared add methods lacked the icons used by Add Transaction; Ask Clover was prefilled, replacing the empty composer's microphone with Send.
- Accounts had a currency selector only in hidden desktop tools.
- Detail headers rendered menu/close controls rather than the shared Back/Adviser arrangement.
- Circle and Goal creation still used type chips; selected detail names remained below generic headers.

## Fixes

- 248px animated mobile drawer with Settings and Help.
- Shared pointer/keyboard dismiss handle and mobile sheet styling on creation forms, retaining existing save validation. Form scrolling stays separate from the drag target.
- Mobile Back replaces menu on details; redundant detail X controls removed; named Budget/Circle/Goal headings and sticky headers.
- Consistent method icons, icon-only table toggles, empty Ask composer, and receipt source tiles.
- Visible account currency control, smaller information icons, compact transaction facts with edit indicators, recurring event backgrounds.
- Row type dropdowns for Recurring, Circle and Goal; subtle dotted Create Circle treatment.

## Validation

- TypeScript passed.
- Focused mobile navigation and manual transaction entry regressions passed.
- Full pre-push gate passed, including TypeScript, web/native regressions, local native exports and production build. Final staging SHA: 47b0f8c2c4e6644355f5242ffc074b697c4234ad.
- Live: Home quick-access transitions; Reports summary icons and Trends headings; Investments premium labels, dedicated Add Investment, Ask composer and upload sources; Accounts currency control and four methods in one row (each 70px wide at 360px); recurring dropdown sheet; Circle creation and named detail header; Budget named header and unclipped sheet; Goal setup; Split Bill entry; transaction detail inline edit rows.
- Browser checks uncovered CSS specificity conflicts in detail headers, clipped Budget sheets, a Goal form intrinsic-width overflow, transaction amount grid placement, and stacked creation header actions. Corrected in follow-up commits.
- Current account has no split bills or investment holdings, so populated Bill/Group details and investment chart range controls were reviewed in source rather than exercised against records. No records were created or changed.
- At 360px, all four Add Account methods share y=202 and equal 70px widths. Drawer settles at x=0, width=248 with Settings and Help visible.
- On c2293136, compact account rows have no gradient; Reports defaults to PHP and offers only owned currencies. A real pointer drag of the Add Transaction handle returns to Reports without saving.
- 0b76362e passed the full pre-push gate and deployed successfully, preserving the concurrent Switch to Clover campaign update.
- Live recheck of 0b76362e: Goal sheet spans 360px, category label and picker share a row, creation header exposes only Back and Adviser, transaction amount occupies the third column of the summary row. Final 47b0f8c2 includes 5ac125fb and preserves the subsequent concurrent campaign heading adjustment. Vercel deployment dpl_GfSTjCRnqQk4FCTwMSzfXLAFSF2J is READY at https://staging.clover.ph.
- Final live recheck at 360px: Reports tabs use 11px type and end at x=301 within the 345px content viewport. Goal sheet clientWidth and scrollWidth both equal 358px (no horizontal sheet scrolling).
- Browser viewport restored after verification.
- Expo cloud builds were not used.
