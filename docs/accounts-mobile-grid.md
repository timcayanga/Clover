# Mobile Accounts card grid — 5 November 2026

Figma: https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=1243-503143

- Mobile web, iOS and Android use two always-visible rounded account cards per section.
- Remove the leather wallet, stitching, sleeve and expand/collapse step from these overviews.
- Preserve institution colors, logos, account names, masked numbers, balances, value ordering and investment institution grouping.
- Whole-card activation and the circular lower-right chevron open the existing account/institution details.
- Mobile overview fields are display-only; existing editing remains in details and the desktop cards.
- Retain swipe deletion and its confirmation. Cash restrictions remain unchanged.
- Keep desktop Accounts presentation, financial records and calculations unchanged.

The main Screens file's light and dark overview/currency variants use editable layers and the existing Poppins typography, account logo images and brand fills. Bottom navigation follows the complete content.

Verification: web/native TypeScript, existing browser compatibility and native adaptive-layout checks; actual web card/row components rendered with synthetic accounts at 320, 390, 768, 1100 and 1440px in light/dark themes. No page/card horizontal overflow, two mobile columns, desktop grid retained. Both chevron and card-name clicks opened the synthetic details view. Long names, large IDR balances and zero balances included. Full pre-push gate and staging verification recorded separately in release artifacts.

Native source is prepared for the next mobile release. No IPA/AAB/APK created or uploaded for this change; deploying staging updates mobile web only until native source is included in a later binary.
