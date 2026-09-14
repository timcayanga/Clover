# Reports platform parity follow-up — 15 September 2026

Baseline staging: `2d7cc7ee`.
Figma file: `FNnCmCj90szZAnZ6twMPCy`.
References: Reports mobile `1243:507886`, desktop `1243:507887`, Spending Mix mobile `1244:510669`.

## Changes

- Native Reports now charts the existing income/spending series and recorded net-worth history. Charts preserve date spacing and signed values, provide gradient fills, shared scales for multiple series, and expandable exact values. Empty histories remain empty; a single observation is a point, not invented history.
- Native Money Over Time explicitly charts income/spending because those are the native endpoint's available period series. Desktop Money Over Time remains the existing tracked-account-balance chart. These are labelled differently and should not be mistaken for identical metrics.
- Income summary values stay green, spending red, net income and savings rate neutral. Comparison text retains its existing directional colors on web and native. Financial calculations are unchanged.
- Native Spending Mix controls wrap below the title at narrow widths instead of overlapping it. Icon controls use a 40px visual size with expanded touch bounds. Shared native subtabs explicitly use Poppins.
- Web Reports gets tighter summary containers, standardized section headings, an enclosed Filters control and browser-shaped subtabs. Account section headings share the Poppins 16 semibold/#7A879C treatment.
- Only the existing sample-mode report fixture has illustrative data. Authenticated reports continue to use the API/offline cache; this change writes no financial records.

## Verification

- Added a release-gated chart geometry check for empty/invalid input, uneven dates, signed values, shared scales, single points and flat histories.
- Native preview checked at 390×844 and 320×568. At 320px, document scroll width is 320px; charts fit their containers, values expand, and bottom navigation remains present. Spending Mix controls wrap without title overlap.
- Required full `qa:prepush` includes TypeScript, regression checks, iOS/Android bundle export and optimized web build. The push hook repeats it before staging publication.

This targeted pass is not an installed-device certification or a complete audit of every detailed Figma state. Native Money Over Time does not yet expose the desktop tracked-balance data series; native chat history/report rendering remain separate outstanding work from the preceding pass.
