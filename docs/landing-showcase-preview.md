# Clover lifestyle story preview

Preview: `/landing-showcase`. This experiment remains separate from the production homepage and mobile applications.

## Narrative and visual structure

The page now follows people through a change in their day, rather than presenting a sequence of Clover features. It reuses the existing production landing page's lifestyle photography, including recurring people, home, airport, and travel scenes. Each moment has a headline and one short paragraph.

1. **Months of finances. Organized in minutes.** A home scene places financial admin alongside friends planning a trip. Small receipt and statement layers move out of the way as the visitor scrolls.
2. **Your evening. Back to you.** Paperwork clears away to a photograph of the laptop and records being put away. The supporting paragraph explains connecting, uploading, or adding manually and retaining the final say.
3. **Less wondering. More knowing.** A couple looks at their finances together. One small question about making room for a trip connects understanding money with deciding what to do next.
4. **Something to look forward to.** The friends reach the airport. A dimensional travel photograph appears in the foreground. The copy connects goals and shared plans with that moment.
5. **A little clarity. A little more living.** The trip photograph expands into the main scene, with a clear invitation to start.
6. **At your pace. At every stage.** Free, Plus, and Pro pricing, billing period/currency controls, and the existing Switch to Clover offer remain available.

The previous transaction-window assembly, account-card fan, spending-chart stage, chat-window stage, and illustrated split-bill stage have been removed. Photography carries the narrative. Product references explain how Clover helps within it.

## Brand and imagery

Raleway headlines, Poppins body text, readable dark teal, mint surfaces, the Clover wordmark, and approved mascots remain. Photographs are existing marketing assets used without modifying their pixels. Responsive `picture` sources provide portrait compositions on phones. The footer identifies lifestyle imagery as illustrative. No private customer records are accessed or displayed.

## Motion and performance

- Native scrolling controls photographic camera movement, perspective, paper displacement, postcard rotation, and depth. Scrolling backward reverses these transformations.
- The header retains Full, Gentle, and Off motion controls and previous/restart/next navigation. Device reduced-motion preferences override the animation preference. Data Saver defaults to Gentle.
- Transform and opacity changes use the existing cached-geometry animation hook. No video, WebGL, animation library, or continuous idle JavaScript animation loop is added.
- Only the hero photograph has high loading priority. Later photographs and mascots use lazy loading. Existing compressed WebP assets are reused.
- Text sits on a stable reading surface. Phone layouts allocate real space for text above photographs instead of placing both in competing absolute positions. Narrow and short screens use natural document flow; reduced motion also removes pinned scroll tracks.
- A skip link, visible focus states, semantic headings, meaningful photo descriptions, labeled controls, and keyboard-dismissable motion settings remain.

## Verification

Browser checks cover beginning, middle, and end scroll positions on phones, tablets, desktop, and short landscape viewports in Chromium, WebKit, and Firefox. Interaction checks cover motion preferences, reverse scrolling, scene navigation, reduced motion, and pricing controls. Performance measurements use a cold cache and a throttled mobile browser. These are browser/emulator checks, not physical-device performance claims.

The full repository `npm run qa:prepush` gate is required before staging deployment. Live verification checks the deployed SHA and the public preview.
