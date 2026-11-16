# Figma platform consistency pass — 14 September 2026

Source: Screens `FNnCmCj90szZAnZ6twMPCy`, shared navigation `228:220`,
Home desktop `1241:59000`, Adviser desktop `1243:505252`.
Starting staging commit: `84b3556f`.

This pass updates shared UI, not financial calculations or stored records.

- Web desktop/mobile: Adviser welcome and composer use Clover wording; prompt
  chips use the rounded 40px minimum control treatment and wrap long labels.
- Web mobile: navigation labels use the shared 11px typography.
- iOS/Android source: primary and planning controls use 40px default visual
  height, 15px Poppins Medium labels, and expanded touch bounds. Long labels
  and accessibility text may increase height rather than clip.
- iOS/Android source: primary buttons use the Clover teal gradient; secondary
  actions retain surface colors. Summary titles use Poppins 16 SemiBold and
  #7A879C. Body and field labels explicitly use the loaded Poppins fonts.
- Native detail navigation now includes the runtime bottom safe-area inset,
  matching the tab navigator and keeping actions clear of system gestures.
- Native Adviser welcome and emoji suggestions align with Clover naming.

Existing header positioning, rectangular navigation, browser-style report and
recurring tabs, account icons, chart centering, desktop Quick Add, and compact
summary spacing were already represented in staging source and retained.

Validation: run the repository `qa:prepush` gate before staging publication.
The RN-web sample preview was checked at 390×844 and 320×568; at 320px its
scroll width is 320px and all five navigation destinations remain present.
Browser preview is not installed iOS/Android proof. Native bundle exports also
are not App Store or Play Store installer releases. This is not a claim of
pixel-by-pixel verification of every detailed state or every native device.
