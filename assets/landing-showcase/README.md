# Landing showcase visuals

`accounts-production-20261009.webp` and `transactions-production-20261009.webp`
are browser captures of Clover's Accounts and Transactions components using
fictional local fixture data. The app components, shell, and global styles were
verified unchanged against the production deployment's commit
`926f5b4849cf0dcb6c248e16c27d1b9626803d86` on 9 October 2026.

Captured at a 402 × 820 CSS-pixel phone viewport. Authentication hooks were
stubbed only in the disposable local capture harness; all API responses were
local fixtures. No customer records were fetched. All temporary capture code
and hook stubs were removed before validation and deployment.

The screenshots retain production rendering. Separate receipt, spending,
conversation and goal illustrations in the showcase use fictional sample data.
They are editorial visualizations, not additional product screenshots.

## Realistic receipt prop · 10 October 2026

`starbucks-receipt-realistic-20261010.webp` was generated with built-in image
 generation (transparent background), inspected, then alpha-trimmed, resized to
520 × 946 and encoded as WebP. It is a fictional **sample receipt**, not a real
Starbucks document or a claim about menu prices. Other merchant amounts in the
showcase are fictional illustrative purchases. The existing app screenshots
remain unaltered captures of the production interface.

Generation prompt:

> Use case: product-mockup. Asset type: photorealistic receipt prop for Clover personal-finance landing page. Create one isolated upright thermal-paper receipt on a genuinely transparent background, no table, no hands, no food, no cup, no phone. Full receipt visible with generous transparent padding, portrait object in a square canvas. Realistic thin slightly ivory paper, subtle wrinkles, a lightly curled bottom corner, tiny irregular torn edges and soft realistic contact shadow. Nearly front-facing with only a gentle 4-degree perspective; daylight from upper left. Text printed in charcoal thermal monospace, crisp and legible. Exact text, in this order: STARBUCKS; SAMPLE RECEIPT; October 5, 2026; Iced Latte    190.00; TOTAL PHP 190.00; Thank you. Keep text sparse, don't invent tax details, branch locations, legal identifiers or additional amounts. A narrow barcode near bottom. Authentic everyday paper texture with restrained mint reflected light at the edges, white paper front remains clear. This is fictional illustrative data, not an actual store receipt. No corporate logo illustration beyond the word STARBUCKS, no Clover logo, no watermark.

## Glass savings prop · 10 October 2026

`savings-glass-20261010.webp` was created using the built-in image-generation
tool with a transparent background, visually inspected, trimmed and exported
at 600 × 762 as alpha WebP (about 105 KB). It is lazy-loaded in the goals scene.
The jar represents saving; its coins do not depict or imply a real balance.

Generation prompt:

> Use case: product-mockup. Asset: isolated photorealistic savings prop for Clover personal finance landing page. One simple rounded transparent glass savings jar, three-quarter front view with a small brushed teal metal lid with coin slot, about half full of subtle warm brass coins, with three loose coins resting at its base. Genuinely transparent background, no table, no backdrop, no words, no labels, no logos, no currency symbols. Full jar visible with generous padding. Crisp studio product photography, soft natural daylight upper left, realistic thick glass rim, refraction, fine surface imperfections, gentle mint reflections in glass and soft contact shadows. Understated premium everyday object, not a toy or cartoon, no exaggerated gold shine. Warm ivory highlights, Clover mint and teal accents. Keep the jar upright, nearly front-facing, realistic proportions.
