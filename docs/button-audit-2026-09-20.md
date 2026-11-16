# Button consistency audit — 20 September 2026

Audited standard named actions across all three Screens Figma pages:
Organize, Understand & Plan, and Connect & Platform. The initial inventory
contained 13,876 named button/action candidates, including repeated platform
examples, tabs, and scaled marketing previews.

The reference is `Clover/Button` (`12:2` primary, `12:6` secondary):

- 40px standard visual height; allow extra height when text wraps in production.
- Poppins Medium 15px, 22px line height.
- 16px horizontal padding and 8px icon/label gap.
- Primary gradient from `#03A8C0` to `#34D3D0`, with a white label in both themes.
- Preserve secondary, destructive, disabled, and special source-choice treatments.

Corrected legacy action label line heights, undersized merchant drill-down
labels, primary label colors, and remaining 44px standard actions. The shared
primary label now uses white rather than the theme-dependent surface color.
Compact Recurring tabs retain their separate 12px semibold typography.
Scaled phone previews and multi-line source-choice tiles are intentional
exceptions. Follow-up checks returned no remaining mismatches for the audited
standard-button rules on any of the three pages.

Web changes reuse `shared-app-styles.css` to centralize inline padding, icon gap,
and the primary gradient/white-label treatment. Disabled actions and upload
source tiles are excluded from the primary override. Native's shared Button
uses the same gradient endpoints; its size, typography and hit slop were already
aligned. No action handlers or financial data behavior changed.

Validation: full `qa:prepush`, Figma read-back and representative visual checks,
followed by staging browser verification. Native bundle validation does not
constitute an installed-device release. The earlier spacing audit remains a
separate unfinished task.
