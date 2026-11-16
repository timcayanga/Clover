# Feature background repair — September 7, 2026

The shared feature renderer previously repeated the same photo as a full-stage
background beneath a narrower masked picture. Different crops produced duplicate
people. Its scroll-dependent final-scene opacity could also stop halfway, and the
fixed 3.5 threshold did not follow each story's chapter count.

The stage now has only a neutral background. Hero and final photographs use
complementary binary opacity targets with a short time-based transition; reduced
motion disables the transition. The photo remains stationary through product and
pricing chapters. Final-scene selection follows the actual final chapter.

## Repaired assets

Created with the built-in image-generation tool, not the CLI. Original assets are
preserved. WebP delivery copies live in the canonical asset directory and are
copied to public/assets by the existing build step:

- `assets/feature-stories/together-hero-repaired.webp`
- `assets/feature-stories/together-hero-repaired-mobile.webp`

Desktop prompt:

> Use case: precise-object-edit. Edit target: attached kitchen photograph for Clover website. Repair both women's hair with fully formed natural hair strands and clean complete silhouettes, especially the curly-haired woman in rust blouse. Remove the trailing plant on the shelf above the people so leaves cannot be mistaken for hair; replace its area with the same clean kitchen wall. Preserve all four people's identities, expressions, clothing, body proportions, positions, camera angle, wide 16:9 composition, foreground man with receipt and phone, kitchen and lighting. Keep broad quiet left wall and empty right kitchen area for separate website text and phone overlay. No added people, no duplicated or translucent people, no text, no UI. Photorealistic, seamless localized repair.

Mobile prompt:

> Use case: precise-object-edit. Edit target: portrait kitchen photograph. Repair both women's hair with fully formed natural strands and clean complete silhouettes, especially curly-haired woman in rust blouse. Remove trailing shelf plant above people so leaves cannot merge with hair; replace only that plant with clean matching wall. Preserve all four identities, expressions, clothing, body proportions, positions, camera angle, portrait composition, man with receipt and phone, kitchen, lighting and empty lower counter. No extra people, ghosting, text or UI. Seamless localized photorealistic repair.

## Regression check

With the local web server running, set AGENT_BROWSER_BIN and optionally
FEATURE_TEST_URL, then run `node scripts/feature-background-check.mjs` from web.
It checks all six stories at five viewport sizes and four scroll positions,
including paused transitions and final CTAs, for a single settled photo, no
duplicate backdrop or transform, loaded images, overflow and error overlays.
