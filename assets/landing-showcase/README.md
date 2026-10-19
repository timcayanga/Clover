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

## Production HD captures · 13 October 2026

`accounts-production-hd-20261013.webp` and
`transactions-production-hd-20261013.webp` are fresh 1206 × 2460 captures,
with matching 804 × 1640 (`-2x`) and 402 × 820 (`-1x`) WebP derivatives for
responsive image selection. These were rendered from production deployment
commit `73ea7693b2aef9d8add1528a3c435b920f6ffde9`, not upscaled from the
October 9 raster images. A disposable local checkout rendered the actual page
components inside a 402 × 820 iframe at 3× CSS scale. All API responses and
authentication hooks used fictional local fixtures; external fetches were
blocked. The production page, shell and styles were not changed. The local
wrapper supplied the production fonts and hid only capture-tool/browser
scrollbar chrome. No harness or authentication stub is shipped with Clover.
The showcase serves at least the 804-pixel source (about 73 KB for Accounts),
with `srcSet` selecting the 1206-pixel source for higher pixel densities. The
high-resolution source is retained for large and Retina displays.

The final fictional transaction fixture keeps Starbucks at PHP 190 on
5 October 2026 in BPI, matching the receipt and moving transaction in the
scroll narrative. Jollibee, Puregold and McDonald's samples also match the
illustrative purchase props. All logos and interface icons were checked before
capture.

`accounts-sections-production-20261014{,-2x}.webp`: actual production Accounts UI at commit `73ea7693`, captured at 3× in an isolated local harness with fictional BPI, UnionBank, BDO, Maya, GCash, GoTrade, and ATRAM records. Cropped from y=325 CSS px through Investments, excluding summary cards and app chrome. 1206×2616 and 804×1744 WebP. No customer information or credentials are included.

`accounts-iphone-squircle-20261014{,-2x}.webp`: refreshed version of the fictional production Accounts capture above. The isolated marketing capture applies the existing production 32px / 9px squircle logo token consistently and aligns names at 50px. The app source, balances, institutions and records are unchanged. 1206×2616 and 804×1744, encoded at quality 92. The preview preserves each screenshot's aspect ratio inside an iPhone-proportioned display.

## Human story photos · 19 October 2026

`closing-friends-20261019.webp` (1536×1024) and `ask-clover-woman-20261019.webp` (900×1200) are fictional, AI-generated editorial lifestyle photographs created with the built-in image generation tool. They do not depict Clover customers. The first shows four Filipino friends on one sofa, safely composed as a left pair and right pair for desktop, and one intact group on mobile. The second shows a Filipino woman using a phone at home. Prompts requested realistic anatomy, natural warm daylight, mint/ivory/denim styling, generous face/headroom, no logos, no legible screens, and no financial claims. Generated originals remain under the Codex generated-images directory; these optimized WebP copies are project-owned and lazy-loaded. Cropping and motion are controlled by responsive CSS.

The two October 19 generated human photos above were superseded the same day. They are retained as unused assets for provenance. The showcase now exclusively reuses the established production people templates (`marketing-photos-v4/adviser-desktop.webp` and `landing-story-v2/06-life.webp`) for these scenes, with responsive CSS/SVG framing and no changes to their identities.

## GCash request sample · 19 October 2026

`gcash-sample-qr.svg` was generated locally with the repository’s existing
`mobile/node_modules/qrcode` encoder, error correction H and blue `#005CE4`.
Its payload is exactly: `Clover sample split bill. This is a demonstration, not a payment request.`
It contains no payment destination, account information, credentials, or money
transfer instruction. The surrounding illustration uses Clover’s existing GCash
institution asset and fictional split amounts.

## Payment-request and readability refinements · 19 October 2026

The main showcase serves the full 1206px production captures directly in larger
iPhone frames, with no enlarge/zoom interaction. Mobile Transactions now has its
own larger phone above the chart rather than hiding that phone. These are the
existing production-UI captures with fictional records; no customer data was used.

`qr-ph-logo.svg` is the CC0 vector from
https://commons.wikimedia.org/wiki/File:QR_Ph_Logo.svg
(original https://upload.wikimedia.org/wikipedia/commons/3/35/QR_Ph_Logo.svg).
The black sample QR retains its existing plain-text demonstration payload; it is
not a payment destination. The masked recipient and phone number are fictional.
Messenger is a code-native vector; WhatsApp, Instagram and Gmail reuse the local
logo library. These illustrate sharing a request and do not send messages.

The Starbucks sample has one Grande Mocha Frappuccino and one Sausage Roll.
Its illustrative PHP120 + PHP70 amounts preserve the PHP190 purchase shown in
the production capture and the receipt-to-report story; these are not menu prices.
