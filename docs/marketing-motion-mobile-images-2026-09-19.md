# Landing and feature motion / mobile photo repair

The September Figma refresh flattened each chapter background into a single viewport export. Replacing its URL bypassed the existing scene transitions, and 390 × 844 mobile renders were enlarged on high-density displays.

Landing and all six feature stories now use a shared layered background with 400ms opacity transitions. Landing copy and phone entrances are restored; feature phone entrances restart for each chapter. Reduced-motion preferences disable motion. Pricing/comparison chapters retain blurred backgrounds.

Mobile photographs come from the original image fills of the existing Connect & Platform Figma nodes, rather than enlarged viewport exports. Eighteen distinct source images (900–941 pixels wide, 1600–1672 tall) are delivered as quality-90 WebP and reused across 38 chapters. Desktop compositions and current phone screenshots remain intact. Mobile uses aspect-preserving cover sizing, a 55% horizontal focal position, 64px header clearance, and an independent reading gradient starting halfway down the viewport.

`web/lib/mobile-story-photos.ts` maps each chapter to its source image. The source node IDs remain in `assets/connect-platform/source-nodes.json`. `sync-public-assets.ts` copies canonical assets during the build. Do not replace these originals with 1× Figma frame exports.

Validation: inspect all chapters using `feature-story-browser-check.mjs`; `feature-background-check.mjs` checks settled transitions, loaded images, aspect-preserving fit and mobile source resolution. The root release gate remains required before deployment.
