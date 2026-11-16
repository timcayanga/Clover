# Investments parity pass — 15 September 2026

Figma Screens: FNnCmCj90szZAnZ6twMPCy, mobile master 1245:522386 and desktop master 1245:522387, inspected using design context.

## Changes
- Desktop Investments places Adviser beside the title, with a separate full-width browser-style tab row and an enclosed Filters button with visible text.
- Mobile web uses the Figma three-plus-two tab arrangement with icons and existing Pro markers. The desktop tab copy is hidden on mobile.
- Native uses compact browser tabs, 40px filter and gradient add buttons, semantic gain/loss colors, and closes filters when switching Profile.
- Below 360px, the native title moves to its own centered row to avoid overlapping the two actions. The minimum header height grows; text stays 18px.
- Native empty-state actions sit within Estimated Value History. No historical values were invented.

## Verification scope
React Native Web preview checked at 390x844 and 320x568, including opening filters. Narrow title overlap was found and fixed. Shared bottom navigation remains visible. Existing production CSS and Poppins were also exercised in an isolated tab-layout fixture.

Full root qa:prepush and iOS/Android exports are required before push. Authenticated staging desktop was inspected before changes; deployment readiness and final web inspection follow the push.

## Remaining gaps
This focused pass does not certify every Investment state. Native has no equivalent of the web Estimated Value History chart yet; it needs a shared valuation-history data contract. Native Portfolio also remains less detailed than web Asset/Institution views. Persistent Adviser history/report cards and installed-device verification remain open from earlier passes. Native code needs a distributed build to reach installed apps.
