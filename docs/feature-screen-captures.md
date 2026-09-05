# Feature screen capture provenance

Captured September 5, 2026, using fictional local fixtures and the actual Clover components/CSS. No customer account was accessed. The public landing pages load only static WebP files, never live financial APIs.

| Asset stem (both `-ph.webp` and `-global.webp`) | Actual source |
| --- | --- |
| accounts | `web/app/accounts/page.tsx` |
| recurring | `RecurringPageClient` / `CommitmentsPanel`, payment calendar |
| reports | `ReportsMoneyOverTimeChart`, the Reports Money over time section |
| adviser | `AdviserChat`, actual conversation UI with an illustrative fixture response, not a live recommendation |
| investments | `web/app/investments/page.tsx`, Overview |
| budget | `BudgetingWorkspace`, budget directory |
| goal | `GoalInlineSetup`, Goals setup section |
| circles | `CirclesPageClient`, circle directory |
| split | `SplitBillWorkspace`, bill directory; settlement computed by `buildSplitBillSettlement` |

All files are saved under `assets/landing-screens/`. Existing Transactions captures remain unchanged. New captures are 402×778, matching the content-area ratio of the shared phone. The phone retains the main landing page's silver frame, status bar, Dynamic Island, glass and home indicator.

## Reproduction and isolation

`web/scripts/fixtures/feature-capture.tsx.txt` archives the local-only harness. It is deliberately outside app routes and is not compiled or deployed. `web/scripts/capture-feature-screens.mjs` drives the isolated browser session, intercepts every `/api/**` request with fictional responses, captures the UI, and encodes WebP assets. Run from `web/` with `ph` or `global` and optional product stems.

During capture only, the harness was mounted at `/capture-local` with pathname contexts for each product. Clerk hooks in CloverShell, RegionalPreferencesSync, and SplitBillHome were temporarily replaced with a null local identity. Those changes were fully restored and the capture route removed before verification/build. Do not expose this harness or identity substitution on a deployed server. The capture browser session was closed before public-page testing.

## Revised shared-money photograph

Built-in image generation, not the CLI, produced `assets/feature-stories/together-hero-screens.webp`. Original mobile and closing photos remain intact. The revised desktop composition reserves a clear far-right strip for the real phone capture.

Final prompt: “Revise composition only. Keep same faces, outfits, kitchen and warm photographic style. The four-person group currently occupies the LEFT half which is wrong. Move the entire group far to the RIGHT and make the group about 60 percent of its current width. In this 1672-pixel-wide picture the LEFTMOST person's LEFT edge must be around x780 and the RIGHTMOST person's RIGHT edge must be around x1230. All four people together occupy a compact cluster between 47% and 74% of image width. Left 45% is empty kitchen wall, no people. Right 25% is empty counter and wall, no people. Heads between 25% and 40% height, bodies through 75% height. This exact narrow central-right composition is essential for overlaid text on left and a separate phone on far right. No text or added graphic elements.”

Final narrow-desktop refinement prompt: “Use case: identity-preserve. Keep this exact warm kitchen photo, same four faces and outfits and phone/receipt action. Make the four-person group smaller and shift it RIGHT. Composition for a responsive website: blank wall must occupy the LEFT 52% of the entire image. ALL people, including arms, occupy ONLY the vertical band from 54% to 77% of total image width. Main man's face at 60% width, both women slightly behind at 65% and 68%, Asian man's face at 73%. Their heads at 25–38% height. Their bodies end around 75% height. Group poses natural and faces individually visible. Rightmost 22% stays blank wall and countertop for an app screenshot added later. No person anywhere to the left of 54% or right of 77%. Preserve a full-bleed realistic connected kitchen environment, with space above all heads. No text, no graphic panels, no phone screenshot added.”

The image-generation skill influenced composition only; all financial UI was captured deterministically from Clover code.
