# Clover landing showcase

Preview only: `/landing-showcase` on staging. No change to the public production
homepage, authenticated app, financial data, or native binaries. The route is
excluded from indexing.

## Story and visual direction

Each chapter keeps one headline and a short paragraph in a protected text area.
The financial product now carries the story instead of travel and generic paper:

1. **Months of finances. Organized in minutes.** Current production Accounts
   screen, real bank logos, a receipt, and a categorized transaction on layered
   planes. The opening explicitly identifies Clover as a personal-finance app.
2. **Many places. One picture.** An interactive sculpture brings BPI, GCash,
   Maya and UnionBank balances around a single total. Select a card to explore
   its balance; select it again to return to the total. All numbers are fictional.
3. **Less sorting. More living.** Receipt and statement layers move aside as the
   production Transactions screen and the corresponding lunch transaction emerge.
4. **Less wondering. More knowing.** Spending segments assemble into a donut;
   category rows make the money picture legible.
5. **Your money. Let’s talk about it.** A sample Ask Clover conversation answers a
   spending question using a comparison chart.
6. **Make room. For what matters.** An emergency-fund goal grows over a quiet
   at-home scene, connecting financial clarity to everyday peace of mind.
7. Existing shared Free/Plus/Pro prices, regional currency selection, annual
   toggle, and Switch to Clover campaign notice.

Accounts and Transactions screenshots were refreshed from the same UI code as
production commit `926f5b4849cf0dcb6c248e16c27d1b9626803d86`, with fictional local
fixtures. See `assets/landing-showcase/README.md` for provenance. Other visual
cards are illustrations with sample data. No customer information is used.

## Motion and responsive behavior

- Sculptural teal ribbons, shaded spheres, extruded card edges and a tilted
  glass platform add a continuous visual language across the chapters. Surface
  lighting animates card edges only, never obscuring labels or balances.
- Long, reversible scroll chapters with CSS perspective, depth, angled screens,
  receipt movement, chart assembly and growing chart/goal bars.
- No WebGL, video download, motion library, or continuous JavaScript idle loop.
  Scroll work uses the existing measured-geometry requestAnimationFrame hook.
- Copy remains outside artwork. Mobile layouts place copy above the stage.
  Decorative mobile mascots are removed where they could obscure financial text.
- Full / Gentle / Off controls, previous / replay / next scene navigation,
  persistent preference, reduced-motion and data-saver support.
- Short viewports use natural document flow rather than cropped sticky screens.
  Off mode and OS reduced motion show the complete final composition, including
  chapters outside the viewport when the mode changes.
- Hero screenshot is prioritized; later imagery is lazy loaded. Both new product
  screenshots together are approximately 71 KB in WebP.

## Verification

Validate the preview at phone, tablet, laptop, desktop and short landscape sizes;
check first and resolved scene states, reverse scroll, motion controls, pricing,
image loading and error logs. Full repository pre-push checks remain mandatory.

### Familiar everyday purchases and physical materials (10 October 2026)

The hero now pairs a realistic, transparent thermal-paper Starbucks sample
receipt with a matching coffee transaction. The import scene introduces Jollibee,
Puregold and McDonald’s sample purchases, with raised card edges and scroll-driven
rotation. Incoming records finish fading before the app text reveals, preventing
overlapping text during forward and reverse scrolling. The receipt responds to
scroll momentum and desktop pointer movement; all of this follows the existing
Full/Gentle/Off and reduced-motion controls. A compressed WebP keeps the added
raster payload small. Section anchor alignment now overrides the inherited
section scroll margin, so anchored scenes use the complete viewport.

### Tactile story across the remaining scenes (10 October 2026)

Accounts now gather with deeper ceramic-like edges and scroll-drawn connecting
lines. The report chart has shaded extrusion beneath each colored segment;
segments assemble reversibly and category buttons focus the center amount and
highlight the selected slice. Selecting the same category resets the total.
Accessible labels follow the selection. Opaque white centers protect amounts.
Ask Clover gains raised message and chart surfaces, restrained card tilt and
comparison bars that grow with scroll. The explanation remains fully opaque.
The goals scene adds a realistic glass savings jar, a dimensional photo frame
and a goal card with a recessed progress track. Pricing cards share the material
language and use existing viewport progress for their entrance.

No WebGL library, additional fetch, or animation dependency was added. The only
new raster asset is a lazy-loaded 105 KB WebP. Existing motion controls, reduced
motion, hidden-tab pauses and short-screen natural layouts remain in effect.
Local verification covered ten viewport sizes from 320 × 740 through
1920 × 1080, Full/Gentle/Off modes, account selection, report category selection
and reset, and phone/desktop compositions. No horizontal overflow or broken
images were observed. Production remains unchanged; the preview is staging only.

### Clover editorial revision (13 October 2026)

This supersedes the decorative-material treatment above. Removed all rendered
ribbons, orbits, pearls, connecting lines, the account platform and chat halo.
The receipt is now lightweight HTML with stylized paper depth; the realistic
receipt and glass jar assets are no longer requested by the page. Human imagery
remains photographic. Accounts use recognizable institution-colored Clover
rows rather than a scattered sculpture. The report stays assembled throughout
scrolling, with one readable panel and interactive category selection.

Sticky chapters retain reversible product entrances, receipt-to-transaction
reveals, chat comparison bars and goal progress. Chapter durations are shorter,
with natural flow for small landscape screens, disabled motion and reduced
motion. Copy is limited to a heading and one paragraph per chapter, drawing on
the production story's start-your-way and financial-habits language.
No new raster assets, WebGL runtime or animation packages were introduced.

### Continuous life-to-clarity story (13 October 2026)

Replaced the independent feature sections with one four-part pinned journey:
everyday purchases, a coherent spending picture, a conversation about what
changed, and a calmer moment at home. Desktop uses a centered caption above a
wide visual stage instead of alternating feature columns. Scroll progress drives
reversible depth, perspective, entrances and departures across that same stage.
The human photo opens into a wider scene; the savings card stays away from the
face. Heading surfaces remain quiet and opaque.

Inactive visual panels are inert, while narrative headings remain available to
assistive technology. Off/reduced-motion and short landscape screens use a normal
flow with every story part available. Gentle motion uses small vertical movement
in place of the stage's perspective travel. The previous/restart/next controls
now navigate individual story parts, including the static layout. No animation
package, WebGL runtime, new raster asset or continuous idle rendering was added.

### Receipt-to-insight continuity (2026-10-13)

The pinned narrative now keeps one Starbucks purchase in a shared DOM layer across its first two acts. Scroll folds the receipt's date/item/barcode away, expands the paper into a categorized transaction row, then moves and scales that row into the Food & dining report. A brief category highlight finishes the handoff; reversing scroll reverses the same geometry. The report reveals behind the purchase before the act boundary, avoiding the prior empty frame between independent panels. Captions stay outside the motion layer. Gentle mode preserves the story without perspective rotations; Off, reduced motion and short viewports retain the natural static examples. No animation library, WebGL, new media payload or background animation loop was added.

### Screen-centered composition (2026-10-13)

Desktop scroll chapters now reserve the center of the viewport for centered heading/subtext. The production phone capture, receipt, spending report, conversation, person and savings goal use the left/right lanes and lower edge instead of sitting under the heading. Portrait/mobile chapters put visuals above centered copy anchored near the bottom; compact reports use a donut beside category rows to preserve clearance. The shared receipt-to-transaction-to-category handoff remains intact. Motion entrances stay inside the visual lanes. Off/reduced/short-window layouts retain the same order in natural document flow with enough height for the full content. Pricing remains a conventional comparison section after the story.

### Immersive scale and HD screens (2026-10-13)

Supporting objects now occupy larger peripheral lanes while preserving the
centered desktop and lower mobile copy. The phone, receipts, chart, chat,
mascots and life image have deeper perspective, dimensional edges and stronger
contact shadows. The same purchase continues through paper → transaction →
category. Full motion uses a short, time-based 65 ms scroll settling response
and quintic easing; frame work stops as soon as scrolling/inertia settles.
Gentle/Off preferences remain available. Production UI screenshots were freshly
rendered at 1206 × 2460 from the live production commit with fictional fixtures,
with responsive 2×/3× WebP sources to avoid serving oversized images to every
visitor. No new animation dependency or continuous idle loop was introduced.

### Production story alignment, 14 October 2026

The showcase follows the production narrative: choose how to start, keep control of your records, understand finances and habits, ask what is possible, manage shared money, and build confidence. Privacy and shared-money chapters reuse the production marketing photographs. The Connect illustration shows six supported Philippine banks; the shared-expense illustration includes GCash and Maya.

The hero uses a fresh 3× capture of the production Accounts UI (production commit `73ea7693b2aef9d8add1528a3c435b920f6ffde9`), cropped to the account lists only. BPI, UnionBank, BDO, Maya, GCash, GoTrade, and ATRAM use fictional balances. Header, overview totals, and navigation are outside the crop. The source capture never contacts production customer APIs. Responsive 804px and 1206px WebP assets retain sharp logos without shipping the raw PNG.

Copy has no opaque panel, blur, or shadow. The receipt descends in the peripheral lane before widening below the copy; report entry happens after the privacy chapter. Desktop copy remains centered in the middle, and phone copy remains centered below the art. Motion Off and short viewports use natural document flow across all six chapters.

### iPhone framing, clearer actions, and regional plan carousel

The preview now reuses production's `JourneyHeader` directly, including the Features dropdown, Help, Contact, Pricing and mobile navigation. The header progress indicator and custom motion/settings UI are removed. Device reduced-motion and Save Data preferences remain automatic; old locally saved showcase motion settings are ignored.

The opening phone leans right and the Transactions phone leans left into the text lane. Other peripheral cards enter tilted inward and normalize with scroll. Both phones have an iPhone-proportioned frame, status area, island and home indicator; screenshots fit without stretching or cropping account content. A fresh account-list capture uses the production 32px brand-mark / 9px corner-radius tokens with matching name spacing. This is an isolated marketing presentation adjustment, not a change to account records or app layout.

Input copy explicitly says “Connect. Upload. Or add it yourself.” Circles and Split Bills each have their own named, icon-bearing illustration. The planning chapter names goals and budgeting and shows both. Narrow/short phones use natural flow with sufficient room for the shared-money cards.

Pricing starts with Pro centered and Yearly selected. Arrow buttons and keyboard left/right cycle Pro, Plus and Free; only the active card is focusable. Currency uses the request's country (PH → PHP, otherwise USD) with no currency filter. iOS and Android icons appear in the opening and footer; Android links to `https://play.google.com/store/apps/details?id=ph.clover.app`, while iOS has a plain availability label. The illustrative-data footer sentence is removed.

### Connected feature stories and a continuous handoff (14 October 2026)

The main preview now goes directly from choosing an input method to understanding
spending, followed by privacy. One persistent paper folds into the Starbucks
transaction, collapses before travelling across the report, and joins its teal
Food & dining segment as that segment draws. Forward and reverse scroll use the
same bounded progress functions. The wide row stays below the desktop caption
and inside the upper mobile art stage. A regression checks ranges, sequencing,
readable report arrival, and exact reverse frames; it runs with browser QA.

Six independent, noindex previews are linked from the shared Features dropdown:

- `/landing-showcase/features/manage-money`: transactions, accounts, recurring.
- `/landing-showcase/features/understand-your-money`: reports, comparisons, chats.
- `/landing-showcase/features/plan-ahead`: portfolio, budgets, savings goals.
- `/landing-showcase/features/manage-money-together`: Circles and Split Bills.
- `/landing-showcase/features/security`: source records, review and data controls.
- `/landing-showcase/features/pro`: wider financial context and the regional,
  yearly-first Pro/Plus/Free carousel.

These reuse the main preview's HD production UI captures, branded mascot assets,
physical card edges, reversible depth and passive, measured scroll renderer.
Human photos remain photographic; financial examples use fictional data. No new
animation package, WebGL runtime, photo payload or financial API is introduced.
Each page keeps a centred desktop caption with art at the edges, and a centred
mobile caption beneath the art. Narrow/short devices and reduced-motion users
get every chapter in document flow. Route changes remount the motion observer,
and inactive caption links cannot take keyboard focus.

The shared navigation accepts optional preview destinations; production defaults
remain intact. All six dropdown entries include descriptive subtext, including
Security and Pro. The production homepage and `/features/*` presentations remain
unchanged. Review this family on staging before deciding on a production switch.

Optimized-build rotation checks also cover offscreen chapters: natural-flow
scenes initialize before entering the viewport, so short landscape rotation
cannot leave a zero-height story. Rotating back restores the pinned composition.

### 18 October: concise motion and shared-money story

The preview now follows input → insights → Ask Clover → Security → shared money. The separate goal/budget chapter is removed from this page; the feature previews remain available. The hero has a branded Starbucks itemized receipt and a bank statement with complementary ingestion motion, plus a higher-resolution welcome mascot. Phone input scenes omit the moving receipt and use the bank grid plus a manual-entry example. Five chapters share a shorter, reversible scroll timeline. Hero, plans and final CTA have motion on desktop and mobile, with reduced-motion fallbacks.

Plan and CTA headings use the chapter scale. Both conversion areas include a plain Log in link, white platform symbols on Clover teal, and the final caption has no subtext. The shared production footer is reused with an optional TikTok link, leaving production footer defaults unchanged.

Shared-money examples reuse the realistic people from production’s closing group photo (`assets/landing-story-v2/06-life.webp`), with CSS crops that leave the original image unchanged, consistently across Circles, item assignments, and feature previews. The split example assigns individual line items and opens an illustrative message/QR preview; nothing is sent and the QR is deliberately nonfunctional. The production app already supports item allocation and payment requests. All example amounts remain fictional.


### 19 October: continuous mobile handoff and a calmer closing scene

Receipt → readable transaction row → category insight now uses the same reversible choreography on desktop and normal-height phones. The transaction has a deliberate readable pause, collapses before crossing the report, and joins its category before disappearing. The mobile rule that hid the handoff is removed; reduced-motion and short-screen natural-flow views retain readable static scenes. The copy remains centered in its own safe area.

The closing caption uses the production landing type scale with natural wrapping. Two opaque production photo cards sit on either side of the desktop caption, then above the caption on phones; there is no background image or closing mascot. White-background download badges retain the Apple and multicolor Google Play marks in the opening, closing, and shared footer. Feature previews share the same footer. Footer resources now list Pro before Security, and the Security label is shortened.


Closing photos are enlarged on desktop and phones. Their full passage through the viewport drives softly damped, reversible 3D settling and restrained image parallax. The caption and actions stay still on a separate plane; mobile reserves the photo row’s full height before the text. Reduced-motion and motion-off views use a fixed pose, with no idle animation loop or new image downloads.

### Continuous scrolling throughout

The main showcase's opening and five middle chapters now occupy their own document space, like pricing and the closing CTA. The middle no longer pins one viewport or replaces captions. Desktop keeps centred copy with art at the edges; mobile keeps art above centred copy, expanding for wrapped text and short screens. Only the supporting art settles as it enters; copy remains fully readable and all chapters remain available to keyboard and assistive technology. The same receipt DOM node travels through the first two chapters and transforms into a transaction and category insight using measured chapter positions, including unequal mobile heights. Scrolling backwards reverses the path. Reduced-motion views use normal flow and static financial examples. Feature previews retain their existing independent presentation.

### Tighter chapters and clearer human framing

Middle desktop chapters are 88svh with a 680px floor; mobile uses content height with shorter art stages and smaller section padding. The purchase's reversible path has a 100ms settling response, while captions and document scrolling remain immediate. The closing scene uses a new fictional editorial group portrait: two safe pair crops on desktop and the whole four-person group on mobile. It no longer repeats the shared-money photo. Ask Clover adds a fictional woman using her phone, arranged behind the chat card on mobile with a separate copy area. Privacy uses the landscape source at a woman-centred focal point on both breakpoints. The opening statement includes the existing BPI logo. New photo assets are compressed WebP and lazy-loaded.
