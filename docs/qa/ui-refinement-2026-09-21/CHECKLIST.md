# UI refinement — 21 September 2026

Requested with 24 screenshots. Implementation and verification record; this is not an exhaustive certification of every historical Figma variant.

## Staging implementation

Implemented the requested public-page fades, Home metrics and budget colors, Reports layout/tooltip, minimal Add chats and upload UI, account picker icons/merge labels, transaction toolbar and inline details, connected desktop/mobile spreadsheet, recurring category icons, header tabs, square glass budget/goal cards, investment section cleanup and rounded mobile navigation.

Deployed commits: `b107ec4f`, `c97f418d`, `179ae337`. Each passed the full pre-push gate and reached READY on staging. Follow-up in this commit fixes nested picker Escape handling, the filter alignment override, goal-card content fit, Cash Flow heading alignment, and the mobile Adviser artwork minimum dimensions.

## Live verification

Browser session: staging.clover.ph, desktop 1440×900 and mobile 390×844.

- Landing and manage-money feature backgrounds showed intermediate opacity values while scrolling both directions; images use cover.
- Home expense value sits below its label; comparisons align left; budget pulse uses its assigned color.
- Reports metric rows aligned; Spending Pace starts without a tooltip and has no obsolete eyebrow.
- Investment tabs occupy the desktop header and one horizontally scrollable mobile row. Empty Add investment CTA is inside history. Planner titles checked.
- Add transaction Ask tab shows the minimal chat. Upload choices span the container. Mobile table remains a connected horizontal grid.
- Desktop spreadsheet modal renders above the sidebar; optional checkboxes have consistent dimensions.
- Transaction details display account/category artwork and open inline fields, including currency. Editing was canceled without saving.
- Account picker shows grouped icon options. Runtime Escape check exposed the global capture-handler issue fixed in this follow-up; final deployed retest required.
- Transactions controls measure 40px tall; final filter alignment correction included here.
- Budget and goal cards show square glass colors and enlarged artwork. Goal action spacing corrected after visual inspection.
- Recurring list helper copy removed. No financial records were changed.

## Figma work

File: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens

Updated primary desktop/mobile designs and shared components: Home metrics/budget colors; Reports metric layouts and chart headers; transaction details/icons/Add To actions; spreadsheet primary, optional and validation variants; account type artwork and minimal chat composers; recurring category icons; Split Bills/Circles headers; investment tabs, section headings and chat; budget/goal card libraries; light and dark mobile navigation. Public chapter prototype transitions use 600ms dissolves; the design guide documents the continuous scroll-driven staging implementation.

Representative nodes: Home `1241:59000`/`1240:59000`; Transactions `1244:511820`; Details `1244:514013`/`1244:514012`; table `1278:97431`; mobile grid `1378:98811`; validation `1397:98834`; optional `1398:98841`; Planner content `612:39182`/`612:39265`; Analysis `612:40017`/`612:40062`; light nav `173:85`; dark nav `759:26049`.

Historical detached/dark page copies are not all independently re-certified. Native installed-app runtime was not tested in this UI pass. The current checklist specifically verifies desktop and mobile web; prior native verification must not be inferred from these results.
