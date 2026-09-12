# Understand & Plan Figma refresh

Design reference: Screens (`FNnCmCj90szZAnZ6twMPCy`), Understand & Plan and Together sections, including the September 2026 changes recorded in the Figma task.

## Implemented

- Budgeting: category-tinted directory cards, presets, semantic action colors, Overview/Reports/Transactions detail tabs, editable setup, and deletion confirmation. Native screens use the existing Profile-scoped budget API for create/edit/pause/delete and actual history.
- Goals: preset entry points, category icons, target/progress cards, four detail tabs and native goal setup/editing. Goal activity uses Manila rolling days, separate currencies, absolute transaction magnitudes and shared transfer classification. Account-level goals remain separate from saved Profile goals.
- Investments: shared header/filter placement, three overview metrics, permanent Pro labels, owned-asset search, on-demand news, and the 13 Figma-exported investment fallback icons. Native routes include portfolio, scenario comparisons, market ranges/news and allocation/return summaries. Web and native scenarios share one pure calculation module.
- Reports: summary containers, chart insight, evidence-backed net-worth history, income sources, three spending-chart modes, and a visible Pro Insights preview for Free accounts. Native Reports reads actual dashboard totals and net-worth evidence through the authenticated mobile boundary.
- Circles and Split Bills: consistent cards, headings and tabs. Native screens read existing role-filtered Circle resources and settlement directions, support Circle creation/metadata editing and manual equal splits. Receipt upload uses the existing parser and storage flow; reviewed totals and equal allocations remain separate from original receipt text, extracted items and stored files.
- Adviser: the native placeholder is replaced by a bounded conversation UI using the existing authenticated API. Budget/Goal questions carry page context. Suggested actions never execute automatically.
- Shared light/dark action colors, 18px page headings, centered mobile headings, bottom navigation and exact exported investment images.

## Validation

- 24 desktop/mobile-web page checks at 1440px/390px, light and dark: loads, framework/runtime errors, images and overflow.
- Budget browser interactions: preset draft, create, all detail tabs, edit and confirmed deletion. Fixed the confirmation becoming clickable before options finished loading.
- 38 native web-preview route/tab/layout checks in light/dark. Fixed selected-tab accessibility state.
- 26 populated native web-preview checks in light/dark using controlled API responses: budget save failure/retry/pause/delete, Goal edits and detail tabs, investment values, Planner comparisons, market ranges/news, receipt review and provenance, Adviser requests and layout/runtime checks. Fixed icon glyphs polluting tab names and web file cleanup leaving receipt forms busy.
- 21 disposable local-database checks through the mobile boundary and shared helpers: authentication, Profile isolation, persisted edits, transfer-excluded totals, Goal progress, dated net-worth evidence and receipt-source separation.
- Full `npm run qa:prepush` is required before staging push, including web/native TypeScript, regression checks, iOS/Android Hermes exports and the web production build. Passed on September 13, 2026, including both Hermes exports and the optimized web build. The first run stopped at an obsolete monogram-icon assertion; it was replaced with checks of the exact web/native Figma exports, and the entire gate was rerun successfully.

All database testing used the guarded local `clover_qa` database. No customer financial records were edited by QA. Temporary browser fixture routes were removed before release builds.

## Boundaries

The native preview is not an iOS/Android simulator test or an App Store/Play upload. Vercel publishes the web app/API; updated native code needs a new native binary to reach installed apps.

Some existing deep workflows still have a richer web implementation: institution trade-history editing, saved investment scenarios beyond the current native session, Circle membership/resource management, custom per-item split allocation and settlement editing. This refresh does not claim complete native feature parity for those workflows. Native market/Reports visualizations use accessible series/bars and summaries; they do not yet duplicate every web chart interaction. Missing historical balance evidence is shown as unavailable, never reconstructed from today's balance. Receipt previews use the existing provider/storage configuration; UI tests mock that external boundary.
