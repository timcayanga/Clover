# Clover scroll showcase preview

Preview: `/landing-showcase`. This is a separate concept; `/` and `/landing-motion` are unchanged.

## Story and visual direction

The eight chapters preserve the progression on the production landing page:

1. Months of finances. Organized in minutes. A readable interactive product story follows a ₱500 Mendokoro receipt through extracted details, categorized transactions, and a monthly spending chart. All three scenes use the same example. Visitors can choose a step or pause/play the walkthrough. The opening is in normal document flow, and the demo appears before the primary CTA on mobile.
2. Start your way. Connect, Upload, and Add manually controls switch an illustrated feature demonstration. Scroll unfolds the transaction panel.
3. Stay in control. A dimensional lock illustrates review, export, and deletion capabilities.
4. See the bigger picture. A current public Accounts screen is framed by sample account and spending views. The composition unfolds from perspective into a more readable view.
5. Ask Clover. A current public Ask Clover screen and the approved mascot accompany three interactive sample questions, with a chart, a goal, and a transaction example.
6. Share the load. The current public Split Bills screen anchors a scene about shared expenses and Circles.
7. Grow at your own pace. Free, Plus, and Pro pricing uses the shared market pricing configuration, with working monthly/yearly and PHP/USD controls. The existing campaign component only appears when the offer is open.
8. Your next chapter. A final invitation to start free.

Typography uses Raleway for marketing headlines and Poppins for supporting text. Teal, light teal, mint, white, and neutral surfaces follow the Foundations and category design libraries at Figma nodes `472:11812` and `472:12117` in file `ihPDxUM9SiMdssYw6XsOho`. Headline/link teal is darkened for legibility.

## Production screen references

Verified against the live `https://clover.ph` DOM on 2026-10-09:

- `/assets/marketing-screens/accounts-20260928.png`
- `/assets/marketing-screens/adviser-20261007.png`
- `/assets/marketing-screens/split-20260928.png`

These are the public sample screens served by production, not screenshots of a private user account. The opening walkthrough is an HTML/SVG product illustration with sample data, not a screenshot or live upload. It uses Clover’s production wordmark, bank logos, category assets, and mascot. The route does not access financial records or perform transactions.

## Motion and performance

- The opening uses lightweight HTML/CSS/SVG animation. The previous Three.js logo renderer and its dependencies have been removed.
- The walkthrough advances every 6.5 seconds only while visible, the browser tab is active, and animation is enabled. Hover and focus pause automatic playback; manually selecting a step stops autoplay until Play is chosen.
- Reduced-motion preferences and the page-wide pause control disable automatic progression and decorative animation. All three steps remain available through keyboard-accessible tabs, including arrow, Home, and End navigation.
- Timers, visibility listeners, and intersection observers are cleaned up on unmount.
- Scroll updates use passive listeners and one requestAnimationFrame batch. Transient progress stays in refs and CSS properties.
- The page uses native scrolling, not wheel interception. Short landscape windows and mobile layouts use natural-flow scenes rather than tall sticky viewports.
- Motion can be paused from the header or footer. Keyboard navigation and a skip link are provided.

## Verification

- Chromium: 320×740, 390×844, 430×932, 768×1024, 844×390, 1024×768, 1440×1000, 1920×1080.
- WebKit: 390×844 and 1024×1366. Firefox: 1440×900.
- Reduced-motion, keyboard step navigation, play/pause, automatic progression, offscreen suspension, and hidden-tab suspension.
- All three product scenes checked for readable controls and content containment at small phone, tablet, and desktop widths.
- Eighteen product-scene containment checks at widths 320, 390, 768, 1100, 1440, and 1920 pixels.
- Working input-mode choices, all three sample chats, monthly/yearly pricing, PHP/USD currency selection, and pause controls.
- No page exceptions, broken loaded images, horizontal page overflow, or detected main-copy occlusion in the tested browser matrix.

Local campaign API responses were stubbed because the local development database was unavailable. The deployment must also be smoke-tested against staging with the real campaign response. Physical-device GPU performance is not implied by browser emulation.
