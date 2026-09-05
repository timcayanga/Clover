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

## Natural-scale revision (September 5)

The narrow-strip version above has been replaced. Built-in image generation (not the CLI) retained the four identities while restoring a life-sized foreground lead and naturally staggered friends behind him. Final asset: `assets/feature-stories/together-hero-screens.webp`. Original generated file: `/Users/TimCayanga1/.codex/generated_images/01a0438c-05ec-73b3-a878-72b13a2f2bfd/exec-6b0c3bb4-bf86-4b08-8644-1a794d567da9.png`.

Initial composition prompt: “Use case: identity-preserve. Recompose this Clover kitchen lifestyle photograph for a full-bleed 16:9 website. Keep exactly these four recognizable people, their faces and clothing, natural body proportions and warm photographic style. They must feel life-sized and comfortably spaced, NOT miniature, narrow, compressed, or packed into a vertical strip. The curly-haired light-skinned man is the foreground lead, looking at his phone with a receipt, centered around 56% width, his head around 25% height. The two women and Asian man chat naturally behind the counter across 66–88% width; their faces are ABOVE the 30% height line, with comfortable headroom above 15%. Keep the bottom-right quadrant from x78% to100%, y34% to100% free of faces (a large phone screenshot will be added there by code; bodies/counter can be behind it). The left 40% is quiet warm wall for copy. Use camera perspective and natural staggered positions, not shrinking or squeezing bodies. Countertop with groceries and bowls reinforces a shared dinner and splitting expenses. No text, no added app screens or graphic overlays. All four faces visible, realistic anatomy, full connected kitchen background.”

Final refinement prompt: “Keep the foreground man EXACTLY this large natural scale and position, same face/outfit/phone/receipt and same kitchen. Change ONLY the three friends behind him: position them a little farther back in the kitchen, with their heads higher in the frame. All three background friends' complete faces and hair must lie between y14% and y25% of the entire image height, with their chins no lower than y25%. Their bodies can continue downward naturally. They should be comfortably spaced across the upper right, around x68%,79%,90%, with natural perspective and anatomy, not squeezed. Their slightly smaller scale must read as depth in the room. This ensures an opaque phone overlay beginning at y28% on the far right will not hide ANY face. Preserve the foreground man's scale, full-bleed background, warm light, empty left wall and all four identities. No added text or screens.”

All main/feature phones now use `--landing-phone-width: min(280px, 21vw, 34.5svh)`. On wide, short desktops the kitchen photograph retains its intrinsic aspect ratio at full height, with the quiet wall continuing under the left copy wash. Mobile retains its dedicated image and hides supplementary phones.

The image-generation skill influenced composition only; all financial UI was captured deterministically from Clover code.
