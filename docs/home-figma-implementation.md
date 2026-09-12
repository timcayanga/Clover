# Home Figma update — 12 September 2026

Reference: Screens, Feature / Home (`146:342`), desktop `50:361`, mobile `50:625`.

Implemented the horizontal turquoise balance gradient, 44px eye control, compact colored monthly totals and directional comparisons, paired daily income/expense bars, outlined report metrics, desktop budget columns (stacked on mobile), and separate Transactions / Recurring / Statements review rows. Recent transaction details remain available in an expandable preview using the existing review dialog.

Financial totals, currencies, date windows, queue logic, and payment completion behavior are preserved. Statement counts represent payment reminders from statements, so the interface labels them explicitly rather than implying they count failed imports. Layout heights grow with content. The existing shared mobile navigation remains available.

Figma desktop design context and screenshots were retrieved. The connector reached its plan limit during the mobile design-context request; mobile alignment used the retrieved layout metadata and existing mobile implementation. No claim of a fresh pixel comparison against the complete mobile Figma render is made.

Browser validation used the actual Home server component with an unpublished local-only QA entry and an isolated PostgreSQL fixture. The temporary route was removed before build. Covered empty/populated data, desktop budget columns, paired charts, three review rows, recent detail expansion, 96 masked amount elements, hide/show and reload persistence, mobile feature drill-down/back, shared navigation, stacked budgets, 390px/320px overflow, and long amount wrapping. Synthetic data remains only in the isolated local QA database.
