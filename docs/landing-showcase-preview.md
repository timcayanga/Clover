# Clover story showcase preview

Preview: `/landing-showcase`. This experiment is separate from the production homepage and mobile applications.

## Narrative

The production landing page's personal journey is the backbone: start comfortably, stay in control, understand your money, see what becomes possible, and share life with others. Each scene has a main title and one short supporting paragraph. There are no numbered chapters or explanatory marketing captions.

A recurring example gives the scenes continuity. Jo's ₱500 Mendokoro receipt becomes a Clover transaction, appears in the monthly spending picture, and is later split with Mika. The same account names, categories, and amounts recur. Understanding the month leads to a conversation about a weekend away, then a shared goal. Product illustrations support these moments rather than introducing unrelated feature demonstrations.

1. **Months of finances. Organized in minutes.** Receipts, a bank card, and recognizable transactions introduce the promise of less time piecing finances together.
2. **Start with what suits you.** A statement, receipt, and manually entered wallet purchase converge into the same set of records.
3. **A little help. Still your say.** The original receipt connects to the transaction's category and confirmation. This replaces the abstract security shield with a concrete moment of control.
4. **One less thing to piece together.** BPI, UnionBank, Maya, and GStocks settle into a clear picture of the everyday and longer-term finances.
5. **It starts to make sense.** A dimensional spending chart reveals the month. The lunch transaction sits alongside its Food & Dining category so the connection remains visible.
6. **Make room for a little possibility.** Jo asks Clover about a weekend away. Clover relates the question to Food & Dining spending and suggests exploring a ₱2,000 monthly goal. Four steps lead to an illustrative ₱8,000 target.
7. **A little easier. Together.** The same goal opens into a dimensional coastal scene. The original lunch is split ₱250 each between Jo and Mika. The visual focuses on what they are planning and sharing.
8. **A little clarity. At every stage.** Existing Free, Plus, and Pro pricing and the Switch to Clover offer remain available.
9. **A little clarity. A little more living.** A calm closing invitation to start free.

## Branding and sample data

Raleway headlines, Poppins supporting text, teal/mint/light-neutral surfaces, existing institution logos, category icons, and approved Clover mascots are retained. Headline teal is darkened for legibility. The source brand references are Figma Foundations and Categories, nodes `472:11812` and `472:12117`, in file `ihPDxUM9SiMdssYw6XsOho`.

The sample account balances sum to ₱84,250. Monthly category totals sum to ₱24,800: Food & Dining ₱9,424 (38%), Housing ₱6,696 (27%), Travel ₱5,208 (21%), and Groceries ₱3,472 (14%). The ledger shows selected transactions, not the entire month's data. The ₱500 lunch is part of Food & Dining; it is not added to that total a second time. Goal steps describe a plan, not deposited funds or a guaranteed outcome.

All scenes now use HTML/CSS illustrations, a small SVG source connector, and existing branding. The unrelated Split Bills screenshot from the prior concept is no longer loaded. The footer identifies the data as illustrative. No private account data is accessed and no financial records are created or changed.

## Motion, accessibility, and performance

- Native scroll position controls perspective, depth, translation, opacity, chart rotation, source-connector drawing, and goal progression. Scroll backward reverses the illustration. There is no forced scrolling or timed slideshow.
- The coastal scene uses CSS layers for hills, sea, sun, and sailboat, with the same goal card carried over from the conversation. No video, WebGL renderer, animation library, or new raster download is added.
- The header retains Full, Gentle, and Off motion settings and previous/restart/next scene navigation. Preferences persist locally. Device reduced-motion preferences override them; Data Saver defaults to Gentle.
- Geometry is measured on layout changes. Passive scroll events schedule requestAnimationFrame updates; progress is held in CSS properties rather than React state. Ambient animations pause offscreen and when the document is hidden.
- Short viewports use natural flow when the whole composition cannot fit. Reduced motion uses natural flow and settled illustrations. Off keeps settled visuals without changing the visitor's current scroll position.
- Headings and financial amounts remain stable and readable. Decorative elements are positioned away from amounts and controls. The page includes a skip link, keyboard focus styles, labeled controls, semantic headings, and sample-data disclosure.
- Bank logo WebP variants are 1.9–2.7 KB. Below-the-fold images are lazy-loaded. Obsolete shield, phone, and independent chat-chart CSS has been removed.

## Verification

Browser verification covers phone, tablet, short landscape, and desktop layouts in Chromium, WebKit, and Firefox. Checks cover clipping, horizontal overflow, image loading, browser errors, and beginning/middle/end scroll states. Targeted checks cover the source-to-transaction connection, reversible goal and coastal motion, motion controls, reduced motion, and shared pricing/campaign behavior. Physical-device GPU performance is not implied by browser emulation.

The repository's full `npm run qa:prepush` gate must pass before the staging update. Live staging verification confirms the deployed commit and the public preview after publishing.
