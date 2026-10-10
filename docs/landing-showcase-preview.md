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
