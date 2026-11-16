# Planning parity pass — 15 September 2026

Figma Screens file: FNnCmCj90szZAnZ6twMPCy.
References inspected with design context:
- Budgeting mobile 1244:514858; desktop 1244:514859.
- Goals mobile 1245:498626; desktop 1245:498627.
These mobile masters cover mobile web, iOS and Android content; native safe-area shells remain in place.

## Changes
- Native Budgeting and Goals use a shared directory card with category-tinted gradient surfaces, 24px corners, 20px padding, and a square minimum footprint. Content can grow beyond that minimum, including at narrow widths and larger text sizes.
- Primary card amounts use Poppins SemiBold 24. Open actions retain the shared white 40px button.
- Native planning headers use a 40px teal-gradient add action with white plus. Detail screens preserve their back/Adviser controls.
- Staging desktop Budgeting visibly had a vertically displaced Adviser and missing create glyph. Scoped planning header CSS aligns the title and Adviser and explicitly sizes the existing Budgeting SVG.

- Mobile-web planning create actions are explicitly restored as 40px icon buttons; a legacy rule had hidden them.
- Goal progress summaries now have a distinct CSS class from the 5px budget meter, so amount, explanation and progress are no longer clipped on desktop/mobile web.

## Verification
- Native React Native Web sample preview inspected at 390x844 and 320x568. A sample Food & Dining budget and long-name Emergency Fund goal were created entirely in sample mode. No authenticated financial records were changed.
- Budget card grows at 320px without horizontal overflow. Add action measures 40x40px. Long goal names wrap inside the card and Open remains visible. Shared bottom navigation remains visible.
- Desktop staging Budgeting inspected before the CSS fix. Production mobile-web layout uses existing collection cards; native preview is not an installed-device test.
- Full root qa:prepush is required before staging push, including native type checking and iOS/Android exports.

## Limits
This is a focused Budgeting/Goals pass, not certification that every screen and state is identical. Persistent native Adviser history, embedded Adviser report cards, and installed-device verification remain open from the previous pass. Native source changes require a new distributed app build before installed apps receive them.
