# Circles and Budgeting directories

- Both routes open an Accounts-inspired card directory, with a dashed create card.
- Circles use `?circle=<id>` for detail selection. Budgeting uses `?budget=<id>` for a single budget, and `?edit=new` (or a budget ID) for a URL-addressable editor.
- Native history navigation supports mobile/browser Back and Forward, refresh, and deep links without refetching the loaded workspace.
- A missing or inaccessible selection displays the directory; never silently select another Circle or budget.
- Circle detail retains its existing six sections and organizer-only title editing.
- Every Budget gets its own card regardless of legacy plan membership. Plan storage remains for compatibility but is no longer shown; no migration rewrites or deletes existing budgets or financial records.
- Creation/editing is a dialog with keyboard focus containment on desktop, and a separate full-page view on mobile with a header Back button and native browser history support.
- Each limit retains its original cadence, currency, scope, transaction matching, planned commitments, history and paused status. A plan is organizational, not an additional transaction filter.
- Each budget detail displays its main progress view, recent-period reports, then transaction history. It has no summary cards, subtabs or plan dropdown. Reports compare prior periods with the current target (historical target revisions are not stored).
- Name and icon editors live directly on cards. Budget identity edits use a strict, workspace-scoped presentation-only endpoint that cannot modify amounts, scope, currency or activity state. Emoji suggestions are local name/category matching with user overrides, and each option has a matching card color.
- Circle identity edits remain organizer-only, using the existing audited API. Its default logo is 24px within a white 48px icon area; organizers can upload a photo or restore Clover.
- Cards use content-driven height, shared Clover typography and colors, visible keyboard focus, responsive columns, and reduced-motion support.

Checks: `npm run qa:prepush`, plus browser navigation/create/edit/history checks in staging at desktop and mobile widths.

September 3 refinement verification: full prepush suite and build passed. Connected Chrome checks covered 320px, 390px, 768px and 1440px layouts; budget name/emoji persistence, matching card color, unchanged target/scope, Circle rename persistence, native Back, desktop creation dialog/Escape, and mobile full-page creation with no horizontal overflow. Existing QA identities were restored after testing; no new budget or financial transaction was created. Circle photo upload reuses the existing bounded image conversion and audited organizer-only endpoint; no new photo was uploaded during this check.
