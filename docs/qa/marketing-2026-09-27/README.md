# Marketing refinement — 27 September 2026

Updated the existing Figma marketing masters before staging implementation:
https://www.figma.com/design/FNnCmCj90szZAnZ6twMPCy/Screens?node-id=622-26549

- Full-viewport landing and feature photographs now start behind the floating header.
- Mobile uses the original portrait photos, a responsive crop and a lower reading fade; faces remain clear.
- Restored the requested headline and supporting text.
- Three decorative example source records appear over the desktop hero desk.
- Photographs scale subtly with scroll (maximum 2.5%); reduced-motion CSS disables scaling.
- Compact comparisons show regional monthly/yearly prices, Adviser, Reports, Accounts, Linked Banks and AI Usage. Full pricing details and entitlements are unchanged.

## Visual verification

Local browser checks at 390 × 844, 486 × 662, 360 × 800 and 1280 × 800:
- Landing hero, privacy chapter and plan comparison.
- All six feature heroes on mobile.
- Manage Money and Manage Money Together desktop compositions.
- Feature Pro comparison: complete table, readable Advanced labels, no horizontal overflow.
- Figma desktop hero and mobile comparison screenshots inspected after final layout edits.

Required staging pre-push gate runs through the repository hook. No Expo cloud build is required for these web changes.
