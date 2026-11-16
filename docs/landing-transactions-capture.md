# Landing phone capture

The phone uses the actual `web/app/transactions/page.tsx` and `CloverShell` mobile UI, not an AI-generated or separately drawn app screen. All records are fictional; the capture fixture is `web/scripts/landing-transactions-fixture.json`.

Assets: `assets/landing-screens/transactions-ph.webp` and `transactions-global.webp`, refreshed September 5, 2026 at 1206 × 2334 pixels with the updated real mobile navigation.

Capture viewport: 402 × 778 CSS pixels at 3× device scale, reserving space above and below for the illustrative iOS status and home-indicator areas. PNG screenshots were encoded to WebP without resizing or cropping. The refreshed capture driver is `web/scripts/capture-feature-screens.mjs`.

A temporary local-only harness rendered the real Transactions component with a pathname context of `/transactions`. Browser-intercepted `/api/**` responses supplied only the fixture data; no user records were queried or changed. Compact viewport state was initialized for the capture. All temporary route and app-state edits were removed afterward; application behavior and authentication are unchanged. Only the Next.js development badge was excluded from the capture.

Global fixture substitutions: Chase Checking and PayPal; Whole Foods ($84.20), Uber ($22), National Grid ($192), Starbucks ($5.75), Salary ($4,800), Chipotle ($14.50), AT&T ($65), Uniqlo ($49.90). Philippine examples are in the JSON fixture. Icons are those rendered by the actual Clover components, including their fallback marks.

The surrounding CSS-rendered silver device uses Apple's iPhone 17 Pro body proportions of 71.9 × 150 mm and 1206 × 2622 display resolution: https://support.apple.com/en-us/125090. Its gloss, side controls, Dynamic Island and iOS status indicators are illustrative framing, not part of the Clover app capture.
