# Clover scroll showcase preview

Preview: `/landing-showcase`. This is a separate concept; `/` and `/landing-motion` are unchanged.

## Story and visual direction

The eight chapters preserve the progression on the production landing page:

1. Months of finances. Organized in minutes. Financial records orbit the official Clover mark, extruded into four beveled 3D leaves that assemble as the reader scrolls.
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

These are the public sample screens served by production, not screenshots of a private user account. Surrounding financial illustrations are explicitly labeled as sample data. The route does not access financial records or perform transactions.

## Motion and performance

- Three.js is imported only when animation is enabled on this route. It is not part of the application's shared first-load bundle.
- The 3D shape is derived from `/clover-mark.svg`. Geometry, materials, environment textures, observers, canvas, and event listeners are disposed on unmount or pause.
- Rendering stops when the scene leaves the viewport or the document is hidden. Pixel density is capped at 1.75.
- Reduced-motion preferences, data-saver mode, unavailable WebGL, and context loss use the vector fallback. Main copy and feature examples remain available.
- Scroll updates use passive listeners and one requestAnimationFrame batch. Transient progress stays in refs and CSS properties.
- The page uses native scrolling, not wheel interception. Short landscape windows and mobile layouts use natural-flow scenes rather than tall sticky viewports.
- Motion can be paused from the header or footer. Keyboard navigation and a skip link are provided.

## Verification

- Chromium: 320×740, 390×844, 430×932, 768×1024, 844×390, 1024×768, 1440×1000, 1920×1080.
- WebKit: 390×844 and 1024×1366. Firefox: 1440×900.
- Reduced-motion and unavailable-WebGL fallbacks.
- WebGL context loss and three consecutive pause/resume cycles, with no duplicate canvases.
- Twenty additional viewport/scroll combinations checking transaction labels remain unobstructed.
- Working input-mode choices, all three sample chats, monthly/yearly pricing, PHP/USD currency selection, and pause controls.
- No page exceptions, broken loaded images, horizontal page overflow, or detected main-copy occlusion in the tested browser matrix.

Local campaign API responses were stubbed because the local development database was unavailable. The deployment must also be smoke-tested against staging with the real campaign response. Physical-device GPU performance is not implied by browser emulation.
