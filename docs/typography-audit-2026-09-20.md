# Clover typography audit — 20 September 2026

Reviewed all three pages in Screens (`FNnCmCj90szZAnZ6twMPCy`): Organize,
Understand & Plan, and Connect & Platform. The inventory included 318,398 text
layers, counting component instances and repeated light/dark/platform examples.

Application text uses Poppins. The existing role hierarchy remains:

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Page title | 18 | Semibold | 27 |
| Section/summary heading | 16 | Semibold | 24 |
| Action | 15 | Medium | 22 |
| Summary value | 22 | Semibold | 33 |
| Supporting summary text | 13 | Regular | 20 |

Corrected legacy Raleway/Inter application copy and inconsistent named-role
sizes/weights, including nested screens, shared components, and platform copies.
Over 29,000 text nodes were explicitly corrected; many are repeated examples.
Canvas organization labels, brand lettering, icon glyphs, public editorial
headlines and proportionally scaled publishing previews are intentional
exceptions. Body, chart, tab and navigation text retain their role-specific sizes.
Do not normalize every label to the action size.

Web implementation reuses `shared-app-styles.css`. Dialogs rendered outside the
app shell now inherit the application heading font and title style. Admin panel
headings join the shared section role. Add-method labels use the action token.

Native application Text and TextInput imports use `app-text.tsx`, which selects
registered Poppins faces and preserves nested text inheritance, custom font
families, refs, accessibility properties and normal text scaling. The Bold face
comes from Google Fonts' Poppins family, under the existing OFL license. The
incorrect `Poppins_500Medium` alias is replaced with `Poppins-Medium`.

Validation includes font registration/weight regression, full `qa:prepush`,
Figma role re-audits and representative visual checks. Native bundles are
validated; this audit does not claim an installed-device release.
