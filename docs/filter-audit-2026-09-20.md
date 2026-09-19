# Filter consistency audit — 20 September 2026

## Figma

Inspected visible filter-named controls across all three Screens pages: 326 nodes in Organize, 529 in Understand & Plan, and 841 in Connect & Platform. These counts include icons, layouts, and repeated screen instances, not unique buttons. Hidden legacy layouts and scaled publishing previews were excluded from normalization.

- Repaired twelve collapsed Investment filter fields in light/dark desktop/mobile supporting states. Their 1px frames now hug the complete label and input; enclosing panels and sections expand to 489px and 617px respectively.
- Standardized transaction filter presets to Poppins Medium 13/20, compact 32px containers with content-based widths.
- Replaced six Split Bills/Circles source filter buttons with the shared slider icon. Desktop retains icon and label; mobile uses a 40px icon control. Reflowed the bill search field into the available width.
- Filter text-bound checks found the twelve collapsed fields; no other direct text overflow was detected in visible filter-named containers. This is a structural check, not a guarantee about all page text or every dynamic value.
- Visually checked the Investment panel, transaction filter popover, and Split Bills search/filter toolbar.

## Staging implementation

- Reused the existing exported Clover filter icon in Split Bills and Investments.
- Added an accessible label for the mobile icon-only bill filter.
- Normalized transaction filter portal actions (40px minimum, Poppins Medium 15/22) and presets (32px, 13/20), with wrapping for long selected labels.
- Constrained report date columns, report summary labels, and bill filter selects to their available width.
- Kept mobile Investment menus within viewport margins rather than positioning them with a negative right offset.
- Kept native filter behavior unchanged; existing shared native controls use the 40px action contract. Installed-device rendering was not verified in this pass.

## Validation

`npm run qa:prepush` passed before push. Browser verification targets Transactions, Reports, Investments and Split Bills at desktop/mobile sizes. No financial records are modified by these presentation changes.
