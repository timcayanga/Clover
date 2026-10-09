# Clover scroll showcase preview

Preview: `/landing-showcase`. The production homepage and the older `/landing-motion` concept are unchanged.

## Story and visual direction

Each scene has one headline and one short supporting paragraph. Eyebrows, numbered chapters, demo instructions, side rails, and extra captions are removed. The sequence follows the production homepage's progression from organizing records to understanding and sharing money:

1. **Months of finances. Organized in minutes.** A dimensional Clover transaction window, receipt, and bank card immediately show what the product does.
2. **A little less admin. A lot more clarity.** Statements, a receipt, and wallet activity converge into categorized transactions as the visitor scrolls.
3. **Your money. Your say.** A glass shield and edit/export controls accompany the private, reviewable, traceable data message.
4. **Your money. All together.** BPI, UnionBank, Maya, and GStocks cards move from a dimensional fan into a readable account overview.
5. **Less guessing. More understanding.** An extruded spending donut turns toward the visitor while category totals settle beside it.
6. **Big questions. Meet your little helper.** Clover's approved mascot accompanies a sample question, answer, and spending report that appear with scroll progress.
7. **Life is shared. Money can be, too.** The public production Split Bills screen rotates into view with shared-payment cards and the Circles mascot.
8. **A little clarity. At every stage.** Free, Plus, and Pro use the shared market pricing configuration, working monthly/yearly and PHP/USD controls, and the existing campaign component.
9. **Money looks better from here.** One final invitation to start free.

Typography uses Raleway for headlines and Poppins for supporting text. Teal, light teal, mint, white, and neutral surfaces follow the Figma Foundations and category libraries at nodes `472:11812` and `472:12117` in file `ihPDxUM9SiMdssYw6XsOho`. Headline teal is darkened for legibility. Bank cards retain their institution colors.

## Assets and example data

The public production homepage at `https://clover.ph` was inspected on 2026-10-09. The showcase's Split Bills phone uses `/assets/marketing-screens/split-20260928.png`, which that homepage serves. It is a public sample screen, not a private user's account.

Other product compositions are HTML/CSS illustrations using Clover's production wordmark, bank logos, category icons, and approved mascots. Example spending categories sum to ₱24,800; the four account balances sum to ₱84,250. The footer identifies the data as illustrative. This route does not read private financial records, import files, or create transactions.

## Scroll and accessibility behavior

- Seven full-screen scenes use longer native scroll tracks. Scroll position directly controls perspective, rotation, depth, translation, opacity, and chart growth. There is no autoplay, timer-driven slideshow, wheel interception, or forced scroll snapping.
- Each scene ends in a readable state before the next one arrives. The header includes a page-progress line and an accessible animation toggle.
- CSS creates the dimensional cards, glass shield, layered donut, and device frame. No animation library, WebGL runtime, or video download is needed.
- Geometry reads are batched before style writes; passive scroll events schedule one requestAnimationFrame update. Progress remains in CSS variables instead of React state.
- Short landscape/compact tablet windows use natural document flow and settled illustrations so content cannot become trapped inside a pinned viewport.
- Reduced-motion preferences collapse the long scroll tracks and show settled illustrations. The header pause control also settles all visuals while retaining the current page position.
- A skip link, visible keyboard focus, labeled controls, meaningful image alternatives, and grouped pricing controls are provided. Decorative elements are hidden from assistive technology.

## Verification

Browser screenshots and scroll-state checks cover narrow phones, phones, tablets, laptop windows, desktop windows, and short landscape windows in Chromium, WebKit, and Firefox. Checks include horizontal overflow, heading/navigation clearance, scene bounds, image loading, browser exceptions, and beginning/middle/end scroll states.

Interaction checks cover changing transforms with scroll, settled visuals while paused, reduced-motion natural flow, keyboard pricing selection, monthly/yearly prices, and PHP/USD switching. Local campaign responses are stubbed because the development database is unavailable; the staging smoke test must use the real campaign endpoint.

Physical-device GPU performance is not implied by browser emulation. The repository's complete `qa:prepush` gate is required before publishing this preview to staging.
