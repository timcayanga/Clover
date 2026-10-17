# Transaction list paging and presentation

The visible ledger uses `summaryMode=rows`: a bounded, authenticated, Profile-scoped database page and exact count. Desktop supports 25, 50, 100 and 200 rows. Native clients retain their existing 30-row requests. Currency filter metadata still covers the entire Profile, including currencies absent from the visible page. Category interpretation and account-display sorting retain their established full mapping paths.

For large desktop pages, `previewSize=25` paints the first rows while the complete page loads. The database offset always uses the selected page size, including page two and later. The preview is never stored as a complete workspace snapshot. Loading feedback remains visible until the full request settles; changing pages resets the table scroll position.

Filtered financial totals load independently using the lightweight grouped summary. Unresolved review rows use the shared actionable-review predicate rather than forcing all history through logo enrichment. A signed amount must not cancel another amount inside a summary group: grouped signed sums are corrected with the matching negative-amount groups to reproduce the sum of individual magnitudes. Stored amounts, confirmations, exclusions and raw payloads are unchanged. Full-summary mapping enriches only returned rows with artwork.

The client shares exact-query responses for 15 seconds in memory. Keys contain the Profile, complete filters, page size, page and response mode. Explicit background refreshes bypass this cache after edits/imports; existing mutation, foreground-refresh and sign-out invalidations remain. Responses from a superseded request cannot overwrite the active query. Totals from a different filter scope are not displayed as current totals.

Desktop footer controls use one row when there is room and balanced rows at narrower desktop widths. Its add action is part of that footer; the redundant floating Bug launcher is removed. Off-screen ledger rows defer painting with CSS content visibility, while logo images retain native lazy loading.

## Artwork

`web/lib/merchant-logo-additions.json` extends the researched catalog without rewriting it. Artwork and public provenance live in `assets/merchant-logos/`; the ordinary asset sync publishes them. Distinctive merchant-position aliases prevent a trailing mall/venue or product name from displacing the merchant. Independent domain/identifier conflicts and confirmed merchant-label safeguards still apply. Old suggestions are re-evaluated after a catalog revision. Uncertain matches retain the category icon. No enrichment writes financial records or invokes AI.

## Verification

The disposable PostgreSQL review regression covers all four page sizes, disjoint pages, the page-two preview offset, exact full-history totals, negative amounts, review counts, Profile isolation, audit entries and preservation of confirmed/source data. The logo projection suite covers 36 common Philippine/travel descriptors, venue precedence, ambiguous labels and old suggestions. Browser checks use actual Transactions/CloverShell components with local-only framework hook adapters and disposable APIs; they are not physical-device tests.
