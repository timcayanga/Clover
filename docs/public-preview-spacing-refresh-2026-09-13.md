# Public previews and summary spacing — September 13, 2026

Reference: the Figma task's phone refresh completed at 13:06 UTC and spacing pass completed at 13:44 UTC, file `FNnCmCj90szZAnZ6twMPCy`.

## Changes

- Re-exported the 14 approved phone viewports used by 23 landing/feature chapter previews at 3× (1200×2298), including the subsequent Accounts, Investments and Circles spacing corrections. Images retain the approved sample data and visible bottom navigation. Existing photograph crops, reading fades and phone hardware remain unchanged.
- Centralized fallback phone imagery so other uses of the public phone component use the same current displays. `assets/connect-platform/source-nodes.json` records each actual viewport node and original app screen; no expiring asset URLs are stored in the app.
- Accounts uses 12px summary-grid gaps, 94px minimum cards, 24px separation before the account list and between account groups, and 10px within groups. Mobile summary totals use the existing compact money formatter; accessible labels and title text preserve full totals, and account rows retain full amounts.
- Removed the mobile Investments 127px minimum left behind after caption removal. Summary rows now fit their cards. Circles cards use a 94px minimum with 20px between content sections. Cards can expand for wrapped labels instead of clipping content.
- Shared iOS/Android components use 6px internal summary spacing and a 94px minimum. Accounts sections use 24px; Reports, Budgets, Goals, Investments and Circles use 20px. Native and web layouts already flow with content and keep navigation at the viewport edge; Figma canvas-only footer/sidebar height reductions do not require hard-coded app heights.

## Verification

- 114 public chapter checks passed: all 38 landing/feature chapters at 1440, 390 and 320 pixels; loaded images, chapter navigation and horizontal overflow.
- 18 app layout checks passed: Accounts, Investments and Circle overview at the same three widths in light/dark themes. Checked rendered card height, summary gaps, following-section gaps and overflow using the real components with fictional API responses. The temporary capture route and generated type references were removed before the release build.
- Two final mobile web screenshots verified the compact Accounts totals and Circle summaries.
- 12 React Native web-preview checks passed: Accounts, Reports, Budgeting, Goals, Investments and Circles in light/dark themes, including navigation, summary content, overflow and bottom navigation. Screenshots wait for navigation panels to finish closing. This verifies the shared interface, not installed iOS/Android binaries or physical devices.
- All 14 WebP assets validated at 1200×2298; together they total approximately 1.32 MB.
- The full `npm run qa:prepush` gate passed: web/native TypeScript, release regressions, native API checks, iOS/Android Hermes bundles and the optimized Next.js build. The existing public-asset regression now checks the new 3× dimensions and approved fallback image reuse.

No financial calculations, stored records, authentication or billing behavior is changed.
